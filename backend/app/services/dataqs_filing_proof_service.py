"""Proof of filing: the confirmation DataQs gave when STS filed a request.

Rules:
- Only STS staff upload it, on a filing attempt of the case (not an abandoned one). It may be
  uploaded while confirming the filing or any time after, e.g. when DataQs emails the PDF later;
  each filing (the request, and any reconsideration or final review) has its own.
- PDF, PNG or JPEG only, decided from the file's content; the same size limit as evidence. The
  object key never contains the file name, and the SHA-256 is kept.
- The carrier sees and downloads the proofs of confirmed filings only. When a proof is added to a
  confirmed filing, the carrier is emailed a link to the case (never the file itself: it carries
  the driver's and inspection's details). One uploaded before the filing is confirmed is
  mentioned in the "filed" email instead.
- Uploads and downloads are written to the case's audit trail.
"""

import hashlib
import uuid
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    DataQsCaseNotFoundError,
    DataQsEvidenceRejectedError,
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    NotFoundError,
)
from app.models import DataQsFilingProof, DataQsSubmissionAttempt, User
from app.models.enums import DataQsAttemptStatus
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_evidence_service import EXTENSIONS, clean_file_name, sniff_type
from app.services.dataqs_evidence_storage import EvidenceStorage
from app.services.dataqs_notifications import DataQsNotifications

PROOF_TYPES = {"application/pdf", "image/png", "image/jpeg"}


class DownloadedProof(NamedTuple):
    data: bytes
    mime_type: str
    file_name: str


class DataQsFilingProofService:
    def __init__(self, db: Session, storage: EvidenceStorage) -> None:
        self.db = db
        self.storage = storage
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    def upload(
        self, user: User, case_id: int, attempt_id: int, *, data: bytes, file_name: str
    ) -> DataQsFilingProof:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff add proof of filing")
        case = self.access.case_to_view(user, case_id)
        attempt = self.db.get(DataQsSubmissionAttempt, attempt_id)
        if attempt is None or attempt.case_id != case.id:
            raise NotFoundError(f"Filing attempt {attempt_id} not found on case {case.id}")
        if attempt.status == DataQsAttemptStatus.ABANDONED:
            raise DataQsInvalidTransitionError(
                "This filing attempt was abandoned; add the proof to the filing that went through"
            )

        limit_mb = get_settings().dataqs_max_upload_mb
        if not data:
            raise DataQsEvidenceRejectedError("The file is empty")
        if len(data) > limit_mb * 1024 * 1024:
            raise DataQsEvidenceRejectedError(f"The file is larger than {limit_mb} MB")
        name = clean_file_name(file_name)
        mime_type = sniff_type(data, name)
        if mime_type not in PROOF_TYPES:
            raise DataQsEvidenceRejectedError(
                "Upload the DataQs confirmation as a PDF, PNG or JPEG"
            )

        sha256 = hashlib.sha256(data).hexdigest()
        key = (
            f"org-{case.organization_id}/case-{case.id}/filing/"
            f"{uuid.uuid4().hex}{EXTENSIONS[mime_type]}"
        )
        proof = DataQsFilingProof(
            case_id=case.id,
            attempt_id=attempt.id,
            object_key=key,
            sha256=sha256,
            file_name=name,
            mime_type=mime_type,
            size_bytes=len(data),
            uploaded_by_id=user.id,
        )
        self.db.add(proof)
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "filing_proof.uploaded",
            after={
                "proof_id": proof.id,
                "attempt_id": attempt.id,
                "file_name": name,
                "sha256": sha256,
            },
        )
        if attempt.status == DataQsAttemptStatus.CONFIRMED:
            request = attempt.gov_request_id or "your request"
            DataQsNotifications(self.db).to_carrier(
                case,
                "FILING_PROOF",
                f"Your DataQs filing confirmation is ready (request {request})",
                f"STS added the confirmation DataQs gave when DataQs request {request} for "
                f"inspection {case.source_event_id} was filed. You can view and download it on "
                "the case page, under Proof of filing.",
                author=user,
            )
        # Store the file last: if storage fails, the rows above roll back with the request.
        self.storage.put(key, data, mime_type)
        self.db.commit()
        return proof

    def download(self, user: User, case_id: int, proof_id: int) -> DownloadedProof:
        case = self.access.case_to_view(user, case_id)
        proof = self.db.get(DataQsFilingProof, proof_id)
        attempt = self.db.get(DataQsSubmissionAttempt, proof.attempt_id) if proof else None
        shown = attempt is not None and (
            user.role.is_staff or attempt.status == DataQsAttemptStatus.CONFIRMED
        )
        if proof is None or proof.case_id != case.id or not shown:
            raise DataQsCaseNotFoundError(f"Proof of filing {proof_id} not found on case {case_id}")
        data = self.storage.get(proof.object_key)
        self.repository.audit(case, user, "filing_proof.downloaded", after={"proof_id": proof.id})
        self.db.commit()
        return DownloadedProof(data, proof.mime_type, proof.file_name)
