"""DataQs cases (docs/DataQ.md): /dataqs/... for STS staff, /portal/dataqs/... for clients.

Both sides read cases and evidence through the same service; dataqs_access.py decides what each
user may see or change. Only a client's account owner opens, submits and approves (each needs
their authorization); staff view every case, add evidence, assign, assess and build packages.
"""

import json
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, Path, Response, UploadFile, status
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from app.api.auth import require_client, require_staff, require_sts_admin
from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.models import User
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsApprovalIn,
    DataQsAssessmentIn,
    DataQsAttemptStartIn,
    DataQsCarrierContactIn,
    DataQsCarrierContactListOut,
    DataQsCaseCreateIn,
    DataQsCaseListOut,
    DataQsCaseOut,
    DataQsChangesIn,
    DataQsCheckOut,
    DataQsClockOverrideIn,
    DataQsCloseIn,
    DataQsConfirmIn,
    DataQsCorrespondenceIn,
    DataQsEvidenceLinkOut,
    DataQsMessageIn,
    DataQsNoteIn,
    DataQsOwnerIn,
    DataQsPackageIn,
    DataQsReviewRequestIn,
    DataQsStaffUserOut,
    DataQsSubmitIn,
    DataQsSupervisorOut,
    DataQsVerifyIssueIn,
    DataQsVersionIn,
)
from app.services.dataqs_assessment_service import DataQsAssessmentService
from app.services.dataqs_case_service import DataQsCaseService
from app.services.dataqs_contact_service import DataQsContactService
from app.services.dataqs_evidence_service import DataQsEvidenceService
from app.services.dataqs_evidence_storage import EvidenceStorage, get_evidence_storage
from app.services.dataqs_filing_adapter import ManualFilingAdapter
from app.services.dataqs_lifecycle import DataQsLifecycleService
from app.services.dataqs_package_service import DataQsPackageService
from app.services.dataqs_supervisor_service import DataQsSupervisorService
from app.services.dataqs_verification_service import (
    DataQsVerificationService,
    FmcsaSource,
    get_fmcsa_source,
)

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
        title: Annotated[str | None, Form(max_length=200)] = None,
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
            title=title,
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


@portal_router.get("/contacts", response_model=DataQsCarrierContactListOut)
def list_contacts(
    user: Annotated[User, Depends(require_client)], db: Annotated[Session, Depends(get_db)]
) -> DataQsCarrierContactListOut:
    """How STS reaches each of the company's verified carriers about its DataQs requests."""
    return DataQsContactService(db).for_company(user)


@portal_router.put("/contacts/{usdot_number}", response_model=DataQsCarrierContactListOut)
def save_contact(
    usdot_number: Usdot,
    body: DataQsCarrierContactIn,
    user: Annotated[User, Depends(require_client)],
    db: Annotated[Session, Depends(get_db)],
) -> DataQsCarrierContactListOut:
    """The company's account owner sets a carrier's email and phone number."""
    return DataQsContactService(db).save(user, usdot_number, body)


# --- Phase 3: assessment, package, approval -------------------------------------------------------


def get_assessment_service(db: Annotated[Session, Depends(get_db)]) -> DataQsAssessmentService:
    return DataQsAssessmentService(db)


def get_package_service(db: Annotated[Session, Depends(get_db)]) -> DataQsPackageService:
    return DataQsPackageService(db)


AssessmentService = Annotated[DataQsAssessmentService, Depends(get_assessment_service)]
PackageService = Annotated[DataQsPackageService, Depends(get_package_service)]
StaffUser = Annotated[User, Depends(require_staff)]
ClientUser = Annotated[User, Depends(require_client)]
StsAdmin = Annotated[User, Depends(require_sts_admin)]


@router.get("/supervisor", response_model=DataQsSupervisorOut)
def supervisor_view(_: StsAdmin, db: Annotated[Session, Depends(get_db)]) -> DataQsSupervisorOut:
    """STS admins: exceptions across every case (late deadlines, unassigned work, failed emails,
    stale cases) and each specialist's workload."""
    return DataQsSupervisorService(db).overview()


@router.get("/supervisor/audit.csv")
def export_audit(
    _: StsAdmin,
    db: Annotated[Session, Depends(get_db)],
    since: date | None = None,
    until: date | None = None,
) -> Response:
    """STS admins: every DataQs audit event from `since` to `until` (inclusive, UTC dates;
    default the last 90 days) as CSV."""
    last = until or datetime.now(UTC).date()
    first = since or last - timedelta(days=90)
    if first > last:
        raise ValidationError("The start date is after the end date")
    if (last - first).days > 366:
        raise ValidationError("Export at most a year at a time")
    body = DataQsSupervisorService(db).audit_csv(
        datetime.combine(first, time(), UTC),
        datetime.combine(last + timedelta(days=1), time(), UTC),
    )
    name = f"dataqs-audit-{first.isoformat()}-to-{last.isoformat()}.csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/staff", response_model=list[DataQsStaffUserOut])
def list_staff(_: StaffUser, db: Annotated[Session, Depends(get_db)]) -> list[DataQsStaffUserOut]:
    """STS staff a case can be assigned to."""
    return [
        DataQsStaffUserOut(id=u.id, full_name=u.full_name, role=u.role.value)
        for u in DataQsCaseRepository(db).staff_users()
    ]


@router.post("/cases/{case_id}/owner", response_model=DataQsCaseOut)
def assign_owner(
    case_id: int,
    body: DataQsOwnerIn,
    user: StaffUser,
    service: AssessmentService,
    cases: CaseService,
) -> DataQsCaseOut:
    service.assign_owner(user, case_id, body.owner_id, body.expected_version)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/assessments", response_model=DataQsCaseOut)
def assess_case(
    case_id: int,
    body: DataQsAssessmentIn,
    user: StaffUser,
    service: AssessmentService,
    cases: CaseService,
) -> DataQsCaseOut:
    """Record the specialist's checks and outcome; the outcome decides who acts next."""
    service.assess(user, case_id, body)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/packages", response_model=DataQsCaseOut)
def build_package(
    case_id: int,
    body: DataQsPackageIn,
    user: StaffUser,
    service: PackageService,
    cases: CaseService,
) -> DataQsCaseOut:
    """Freeze the narrative and evidence manifest as a new package version (a material edit
    replaces the old package and any approval of it) and send it to the carrier for approval."""
    service.build(user, case_id, body)
    return cases.detail(user, case_id)


@portal_router.post("/cases/{case_id}/resubmit", response_model=DataQsCaseOut)
def resubmit_case(
    case_id: int,
    body: DataQsVersionIn,
    user: ClientUser,
    service: AssessmentService,
    cases: CaseService,
) -> DataQsCaseOut:
    """After adding the evidence STS asked for: send the case back to STS."""
    service.resubmit(user, case_id, body.expected_version)
    return cases.detail(user, case_id)


@portal_router.post("/cases/{case_id}/approvals", response_model=DataQsCaseOut)
def approve_package(
    case_id: int,
    body: DataQsApprovalIn,
    user: ClientUser,
    service: PackageService,
    cases: CaseService,
) -> DataQsCaseOut:
    """Approve filing one exact package, named by its id and fingerprint."""
    service.approve(user, case_id, body)
    return cases.detail(user, case_id)


@portal_router.post("/cases/{case_id}/package-changes", response_model=DataQsCaseOut)
def request_package_changes(
    case_id: int,
    body: DataQsChangesIn,
    user: ClientUser,
    service: PackageService,
    cases: CaseService,
) -> DataQsCaseOut:
    """Ask STS to change the package before approving it."""
    service.request_changes(user, case_id, body)
    return cases.detail(user, case_id)


# --- Phase 4: manual filing -----------------------------------------------------------------------


def get_filing_adapter(db: Annotated[Session, Depends(get_db)]) -> ManualFilingAdapter:
    return ManualFilingAdapter(db)


Filing = Annotated[ManualFilingAdapter, Depends(get_filing_adapter)]


@router.post(
    "/cases/{case_id}/submission-attempts",
    response_model=DataQsCaseOut,
    status_code=status.HTTP_201_CREATED,
)
def start_filing(
    case_id: int,
    body: DataQsAttemptStartIn,
    user: StaffUser,
    filing: Filing,
    cases: CaseService,
    idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
) -> DataQsCaseOut:
    """Record that a specialist is filing the approved package in DataQs (one open attempt at a
    time, so nobody files it twice)."""
    filing.start(user, case_id, body, idempotency_key)
    return cases.detail(user, case_id)


@router.post(
    "/cases/{case_id}/submission-attempts/{attempt_id}/confirm", response_model=DataQsCaseOut
)
def confirm_filing(
    case_id: int,
    attempt_id: int,
    body: DataQsConfirmIn,
    user: StaffUser,
    filing: Filing,
    cases: CaseService,
) -> DataQsCaseOut:
    """Record the request ID and acknowledgement DataQs showed; only now is the case submitted.
    Also how an unconfirmed attempt is settled when the request is found in DataQs."""
    filing.confirm(user, case_id, attempt_id, body)
    return cases.detail(user, case_id)


@router.post(
    "/cases/{case_id}/submission-attempts/{attempt_id}/unconfirmed", response_model=DataQsCaseOut
)
def unconfirmed_filing(
    case_id: int,
    attempt_id: int,
    body: DataQsNoteIn,
    user: StaffUser,
    filing: Filing,
    cases: CaseService,
) -> DataQsCaseOut:
    """The portal timed out or the result is unclear: no new attempt until it is settled."""
    filing.mark_unconfirmed(user, case_id, attempt_id, body.note)
    return cases.detail(user, case_id)


@router.post(
    "/cases/{case_id}/submission-attempts/{attempt_id}/abandon", response_model=DataQsCaseOut
)
def abandon_filing(
    case_id: int,
    attempt_id: int,
    body: DataQsNoteIn,
    user: StaffUser,
    filing: Filing,
    cases: CaseService,
) -> DataQsCaseOut:
    """Nothing was submitted, or DataQs shows no such request: ready to file again."""
    filing.abandon(user, case_id, attempt_id, body.note)
    return cases.detail(user, case_id)


# --- Phase 5: agency correspondence, appeals, deadlines -------------------------------------------


def get_lifecycle(db: Annotated[Session, Depends(get_db)]) -> DataQsLifecycleService:
    return DataQsLifecycleService(db)


Lifecycle = Annotated[DataQsLifecycleService, Depends(get_lifecycle)]


@router.post("/cases/{case_id}/correspondence", response_model=DataQsCaseOut)
def record_correspondence(
    case_id: int,
    body: DataQsCorrespondenceIn,
    user: StaffUser,
    lifecycle: Lifecycle,
    cases: CaseService,
) -> DataQsCaseOut:
    """Record a verified agency event: an information request, STS's answer, a decision or a
    reopening. Only these move the case's stage and deadlines."""
    lifecycle.record(user, case_id, body)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/review-requests", response_model=DataQsCaseOut)
def propose_review(
    case_id: int,
    body: DataQsReviewRequestIn,
    user: StaffUser,
    lifecycle: Lifecycle,
    cases: CaseService,
) -> DataQsCaseOut:
    """Propose the next review stage for denied issues; it then needs assessment, a new package
    and the carrier's approval before it is filed."""
    lifecycle.propose_review(user, case_id, body)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/clocks/{clock_id}/override", response_model=DataQsCaseOut)
def override_deadline(
    case_id: int,
    clock_id: int,
    body: DataQsClockOverrideIn,
    user: StaffUser,
    lifecycle: Lifecycle,
    cases: CaseService,
) -> DataQsCaseOut:
    """STS admin: set a deadline by hand (e.g. a state's own counting rule), with the reason."""
    lifecycle.override_clock(user, case_id, clock_id, body)
    return cases.detail(user, case_id)


# --- Emails to the carrier, closing the file ------------------------------------------------------


@router.post("/cases/{case_id}/messages", response_model=DataQsCaseOut)
def email_carrier(
    case_id: int, body: DataQsMessageIn, user: StaffUser, lifecycle: Lifecycle, cases: CaseService
) -> DataQsCaseOut:
    """Email the carrier about the case; the message is kept on the case for both sides."""
    lifecycle.send_message(user, case_id, body)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/close", response_model=DataQsCaseOut)
def close_file(
    case_id: int, body: DataQsCloseIn, user: StaffUser, lifecycle: Lifecycle, cases: CaseService
) -> DataQsCaseOut:
    """Close the file; the carrier is emailed that it is closed, with the note."""
    lifecycle.close_file(user, case_id, body)
    return cases.detail(user, case_id)


# --- Phase 6: is the correction in FMCSA's data? ----------------------------------------------


@router.post("/cases/{case_id}/verification/check", response_model=DataQsCaseOut)
def check_correction(
    case_id: int,
    user: StaffUser,
    cases: CaseService,
    db: Annotated[Session, Depends(get_db)],
    source: Annotated[FmcsaSource, Depends(get_fmcsa_source)],
) -> DataQsCaseOut:
    """Look at FMCSA's inspection record now instead of waiting for the daily check."""
    DataQsVerificationService(db, source).check_now(user, case_id)
    return cases.detail(user, case_id)


@router.post("/cases/{case_id}/issues/{issue_id}/verification", response_model=DataQsCaseOut)
def confirm_correction(
    case_id: int,
    issue_id: int,
    body: DataQsVerifyIssueIn,
    user: StaffUser,
    cases: CaseService,
    db: Annotated[Session, Depends(get_db)],
) -> DataQsCaseOut:
    """STS confirms by hand, with its proof, that FMCSA's records show the correction."""
    DataQsVerificationService(db).confirm(user, case_id, issue_id, body)
    return cases.detail(user, case_id)
