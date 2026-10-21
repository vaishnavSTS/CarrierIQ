"""DataQs evidence: upload, link to issues, download (docs/DataQ.md, Phase 2).

Rules:
- Only users who may act on the case upload (dataqs_access.py): the carrier's owner while the case
  is a draft, needs evidence or is in STS review; STS staff until the case is closed.
- The file's type is decided from its content, not its name or the browser's claim: PDF, JPEG,
  PNG, MP4 or a CSV (plain text). Anything else, an empty file or one over DATAQS_MAX_UPLOAD_MB
  is refused. The bucket's own type list does not apply to the backend's keys, so this is the
  check that counts.
- Every file is linked to at least one of the case's issues, with a note on why it is relevant.
- The original is kept unchanged with its SHA-256; the object key never contains the file name.
- Malware scanning is not wired yet (decision D2): files stay scan_status PENDING until it is.
- Each download is written to the case's audit trail.
"""

import hashlib
import re
import uuid
from datetime import date
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    DataQsCaseNotFoundError,
    DataQsEvidenceRejectedError,
    DataQsInvalidTransitionError,
    ValidationError,
)
from app.models import DataQsEvidence, DataQsEvidenceLink, User
from app.models.enums import DataQsWorkStatus
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_case_service import CARRIER_UPLOAD_STATUSES
from app.services.dataqs_evidence_storage import EvidenceStorage

EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "video/mp4": ".mp4",
    "text/csv": ".csv",
}


class DownloadedEvidence(NamedTuple):
    data: bytes
    mime_type: str
    file_name: str


def sniff_type(data: bytes, file_name: str) -> str | None:
    """The file's real type from its first bytes; None when it is not an allowed type."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    if file_name.lower().endswith(".csv") and b"\x00" not in data:
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None
        return "text/csv"
    return None


def clean_file_name(file_name: str) -> str:
    """The name as shown to people: no folders, no control characters, at most 200 characters."""
    name = re.split(r"[\\/]", file_name or "")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip() or "evidence"
    return name[-200:]


class DataQsEvidenceService:
    def __init__(self, db: Session, storage: EvidenceStorage) -> None:
        self.db = db
        self.storage = storage
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    def upload(
        self,
        user: User,
        case_id: int,
        *,
        data: bytes,
        file_name: str,
        issue_links: dict[int, str],
        document_date: date | None,
    ) -> DataQsEvidence:
        case = self.access.case_to_act_on(user, case_id)
        allowed = (
            case.work_status != DataQsWorkStatus.CLOSED
            if user.role.is_staff
            else case.work_status in CARRIER_UPLOAD_STATUSES
        )
        if not allowed:
            raise DataQsInvalidTransitionError("Evidence can't be added at this stage of the case")

        max_bytes = get_settings().dataqs_max_upload_mb * 1024 * 1024
        if not data:
            raise DataQsEvidenceRejectedError("The file is empty")
        if len(data) > max_bytes:
            raise DataQsEvidenceRejectedError(
                f"The file is larger than {get_settings().dataqs_max_upload_mb} MB"
            )
        name = clean_file_name(file_name)
        mime_type = sniff_type(data, name)
        if mime_type is None:
            raise DataQsEvidenceRejectedError(
                "Only PDF, JPEG, PNG, MP4 and CSV files can be uploaded"
            )

        case_issues = {issue.id for issue in self.repository.issues([case.id])}
        if not issue_links:
            raise ValidationError("Link the file to at least one issue")
        for issue_id, relevance in issue_links.items():
            if issue_id not in case_issues:
                raise ValidationError(f"Issue {issue_id} is not part of this case")
            if len(relevance.strip()) < 5:
                raise ValidationError("Say briefly how the file supports each issue")

        sha256 = hashlib.sha256(data).hexdigest()
        key = f"org-{case.organization_id}/case-{case.id}/{uuid.uuid4().hex}{EXTENSIONS[mime_type]}"
        evidence = DataQsEvidence(
            case_id=case.id,
            object_key=key,
            sha256=sha256,
            file_name=name,
            mime_type=mime_type,
            size_bytes=len(data),
            document_date=document_date,
            uploaded_by_id=user.id,
        )
        self.db.add(evidence)
        self.db.flush()
        for issue_id, relevance in issue_links.items():
            self.db.add(
                DataQsEvidenceLink(
                    evidence_id=evidence.id, issue_id=issue_id, relevance=relevance.strip()
                )
            )
        self.repository.audit(
            case,
            user,
            "evidence.uploaded",
            after={
                "evidence_id": evidence.id,
                "file_name": name,
                "sha256": sha256,
                "issue_ids": sorted(issue_links),
            },
        )
        # Store the file last: if storage fails, the rows above roll back with the request.
        self.storage.put(key, data, mime_type)
        self.db.commit()
        return evidence

    def download(self, user: User, case_id: int, evidence_id: int) -> DownloadedEvidence:
        case = self.access.case_to_view(user, case_id)
        evidence = self.db.get(DataQsEvidence, evidence_id)
        if evidence is None or evidence.case_id != case.id:
            raise DataQsCaseNotFoundError(f"Evidence {evidence_id} not found on case {case_id}")
        data = self.storage.get(evidence.object_key)
        self.repository.audit(case, user, "evidence.downloaded", after={"evidence_id": evidence.id})
        self.db.commit()
        return DownloadedEvidence(data, evidence.mime_type, evidence.file_name)
