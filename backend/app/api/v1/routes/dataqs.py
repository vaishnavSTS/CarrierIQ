"""DataQs cases (docs/DataQ.md): /dataqs/... for STS staff, /portal/dataqs/... for clients.

Both sides read cases and evidence through the same service; dataqs_access.py decides what each
user may see or change. Only a client's account owner opens and submits a case (it needs their
authorization); staff can view every case and add evidence.
"""

import json
from collections.abc import Callable
from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, Path, Response, UploadFile, status
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from app.api.auth import require_client, require_staff
from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.models import User
from app.schemas.dataqs import (
    DataQsCaseCreateIn,
    DataQsCaseListOut,
    DataQsCaseOut,
    DataQsCheckOut,
    DataQsEvidenceLinkOut,
    DataQsSubmitIn,
)
from app.services.dataqs_case_service import DataQsCaseService
from app.services.dataqs_evidence_service import DataQsEvidenceService
from app.services.dataqs_evidence_storage import EvidenceStorage, get_evidence_storage

router = APIRouter(prefix="/dataqs", tags=["dataqs"])
portal_router = APIRouter(prefix="/portal/dataqs", tags=["dataqs"])

Usdot = Annotated[int, Path(gt=0, lt=100_000_000)]
InspectionId = Annotated[str, Path(min_length=1, max_length=50)]
_LINKS = TypeAdapter(list[DataQsEvidenceLinkOut])


def get_case_service(db: Annotated[Session, Depends(get_db)]) -> DataQsCaseService:
    return DataQsCaseService(db)


def get_evidence_service(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[EvidenceStorage, Depends(get_evidence_storage)],
) -> DataQsEvidenceService:
    return DataQsEvidenceService(db, storage)


CaseService = Annotated[DataQsCaseService, Depends(get_case_service)]
EvidenceService = Annotated[DataQsEvidenceService, Depends(get_evidence_service)]


def _parse_links(raw: str) -> dict[int, str]:
    try:
        links = _LINKS.validate_python(json.loads(raw))
    except (ValueError, PydanticValidationError) as exc:
        raise ValidationError("links must be a list of {issue_id, relevance}") from exc
    return {link.issue_id: link.relevance for link in links}


def _add_case_routes(router: APIRouter, who: Callable[..., User]) -> None:
    """Routes both portals share; `who` is the portal's login check."""
    UserDep = Annotated[User, Depends(who)]  # noqa: N806

    @router.get("/cases", response_model=DataQsCaseListOut)
    def list_cases(user: UserDep, service: CaseService) -> DataQsCaseListOut:
        """Cases this user may see, newest first."""
        return DataQsCaseListOut(cases=service.list_cases(user))

    @router.get("/cases/{case_id}", response_model=DataQsCaseOut)
    def get_case(case_id: int, user: UserDep, service: CaseService) -> DataQsCaseOut:
        return service.detail(user, case_id)

    @router.get(
        "/carriers/{usdot_number}/inspections/{inspection_id}/check",
        response_model=DataQsCheckOut,
    )
    def check_inspection(
        usdot_number: Usdot, inspection_id: InspectionId, user: UserDep, service: CaseService
    ) -> DataQsCheckOut:
        """Before a case: the inspection as preserved, the review window, open cases on it, and
        whether this user may open one."""
        return service.check(user, usdot_number, inspection_id)

    @router.post(
        "/cases/{case_id}/evidence",
        response_model=DataQsCaseOut,
        status_code=status.HTTP_201_CREATED,
    )
    def upload_evidence(
        case_id: int,
        user: UserDep,
        evidence: EvidenceService,
        cases: CaseService,
        file: Annotated[UploadFile, File()],
        links: Annotated[str, Form(description='JSON: [{"issue_id": 1, "relevance": "..."}]')],
        document_date: Annotated[date | None, Form()] = None,
    ) -> DataQsCaseOut:
        """Upload one file and link it to issues; answers the updated case."""
        limit = get_settings().dataqs_max_upload_mb * 1024 * 1024
        data = file.file.read(limit + 1)  # one byte over the limit is enough to refuse it
        evidence.upload(
            user,
            case_id,
            data=data,
            file_name=file.filename or "evidence",
            issue_links=_parse_links(links),
            document_date=document_date,
        )
        return cases.detail(user, case_id)

    @router.get("/cases/{case_id}/evidence/{evidence_id}")
    def download_evidence(
        case_id: int, evidence_id: int, user: UserDep, evidence: EvidenceService
    ) -> Response:
        """The original file, as an attachment; every download is in the case's audit trail."""
        file = evidence.download(user, case_id, evidence_id)
        return Response(
            content=file.data,
            media_type=file.mime_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file.file_name)}",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        )


_add_case_routes(router, require_staff)
_add_case_routes(portal_router, require_client)


@portal_router.post(
    "/carriers/{usdot_number}/cases",
    response_model=DataQsCaseOut,
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    usdot_number: Usdot,
    body: DataQsCaseCreateIn,
    user: Annotated[User, Depends(require_client)],
    service: CaseService,
    idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
) -> DataQsCaseOut:
    """Open a DRAFT case on an inspection (wizard steps 1-5). Send an Idempotency-Key header: a
    repeated request with the same key answers the first case."""
    case = service.create(user, usdot_number, body, idempotency_key)
    return service.detail(user, case.id)


@portal_router.post("/cases/{case_id}/submit", response_model=DataQsCaseOut)
def submit_case(
    case_id: int,
    body: DataQsSubmitIn,
    user: Annotated[User, Depends(require_client)],
    service: CaseService,
) -> DataQsCaseOut:
    """Sign the authorization and submit the case for STS review (wizard steps 6-7)."""
    service.submit(user, case_id, body)
    return service.detail(user, case_id)
