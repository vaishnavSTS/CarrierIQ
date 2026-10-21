"""DataQs filing packages and the carrier's approval of them (docs/DataQ.md, Phase 3).

- STS builds a package once the latest assessment is READY_TO_PREPARE: the narrative, the issues
  and requested corrections, the evidence (exact versions and SHA-256 hashes), references, and the
  carrier and representative details. Everything is frozen in `manifest`; `manifest_hash` is the
  SHA-256 of the manifest as canonical JSON, and the manifest carries the narrative's own hash, so
  the fingerprint covers every word and file.
- Building again with any change is a material edit: a new package version, the old one
  invalidated and any approval of it revoked. The case goes back to the carrier for approval.
  Building again with identical content changes nothing.
- The carrier's owner approves one exact package by its id and fingerprint, after reading the
  package terms (separate from the general consent given at submission). An approval of an older
  package or fingerprint is refused as stale. Or the carrier asks for changes, with a message.
- Filing (Phase 4) is allowed only while `DataQsCaseRepository.current_approval` finds an approval
  of the current package.
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    DataQsStaleVersionError,
    ValidationError,
)
from app.models import DataQsAssessment, DataQsAuthorization, DataQsCase, DataQsPackage, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsAssessmentOutcome,
    DataQsAuthorizationKind,
    DataQsScanStatus,
    DataQsWorkStatus,
    UserRole,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import DataQsApprovalIn, DataQsChangesIn, DataQsPackageIn
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_assessment_service import check_version, now
from app.services.dataqs_checklist import DATAQS_REASON
from app.services.dataqs_notifications import DataQsNotifications

PACKAGE_TERMS_VERSION = "2026-10-21b-draft"
PACKAGE_TERMS_TEXT = (
    "I have reviewed this DataQs request package, including the narrative and every listed file. "
    "To the best of my knowledge the statements and documents in it are true, accurate and "
    "complete. I approve Sky Transport Solutions (STS) filing exactly this package with FMCSA's "
    "DataQs on my company's behalf. If anything in the package changes, STS must ask for my "
    "approval again. I understand that, as DataQs warns, any intentionally false or misleading "
    "statement or document may result in closure of the request and may be subject to prosecution "
    "under Federal law (18 U.S.C. 1001). A state agency decides the request; filing does not "
    "guarantee that the record will be changed or removed."
)
MANIFEST_FORMAT = "dataqs-package/1"
CARRIER_APPROVAL_TARGET = timedelta(days=7)
BUILDABLE = {
    DataQsWorkStatus.STAFF_REVIEW,
    DataQsWorkStatus.AWAITING_APPROVAL,
    DataQsWorkStatus.READY_TO_FILE,
}


# Open tasks that mean the case still waits for (another) assessment, e.g. an appeal just proposed.
AWAITING_ASSESSMENT = {"ASSESS_CASE", "SPECIALIST_REVIEW", "WAIT_EXTERNAL"}


def ready_to_prepare(assessments: list[DataQsAssessment], open_task_kinds: set[str]) -> bool:
    """The latest assessment says ready to prepare, and no newer assessment is due (an appeal
    STS proposes needs its own staff review before its package)."""
    if not assessments or assessments[-1].outcome != DataQsAssessmentOutcome.READY_TO_PREPARE:
        return False
    return not open_task_kinds & AWAITING_ASSESSMENT


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def manifest_hash(manifest: dict[str, Any]) -> str:
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256_text(canonical)


class DataQsPackageService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    # --- STS: build ------------------------------------------------------------------------------

    def build(self, user: User, case_id: int, body: DataQsPackageIn) -> DataQsPackage:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff build filing packages")
        case = self.access.case_to_act_on(user, case_id)
        check_version(case, body.expected_version)
        if case.work_status not in BUILDABLE:
            raise DataQsInvalidTransitionError("A package can't be built at this stage")
        if self.repository.open_attempt(case.id) is not None:
            raise DataQsInvalidTransitionError(
                "Filing is in progress; settle the filing attempt before changing the package"
            )
        open_kinds = {t.kind for t in self.repository.open_tasks([case.id])}
        if not ready_to_prepare(self.repository.assessments(case.id), open_kinds):
            raise DataQsInvalidTransitionError(
                "Assess the case as ready to prepare before building a package"
            )

        manifest = self._manifest(case, body)
        current = self.repository.current_package(case.id)
        at = now()
        if current is not None and current.manifest_hash == manifest_hash(
            {**manifest, "package_version": current.package_version}
        ):
            # Nothing material changed: the same package (and any approval) stands. After the
            # carrier asked for changes, sending it unchanged puts it back in front of them.
            if case.work_status == DataQsWorkStatus.STAFF_REVIEW:
                self._await_approval(case, user, current, at, "package.resent", replaced=None)
            return current

        replaced_approval = None
        if current is not None:
            replaced_approval = self.repository.current_approval(case.id)
            current.invalidated_at = at
            if replaced_approval is not None:
                replaced_approval.revoked_at = at
        version = max([0] + [p.package_version for p in self.repository.packages(case.id)]) + 1
        manifest["package_version"] = version
        fingerprint = manifest_hash(manifest)
        package = DataQsPackage(
            case_id=case.id,
            package_version=version,
            narrative=body.narrative.strip(),
            manifest=manifest,
            manifest_hash=fingerprint,
            created_by_id=user.id,
        )
        self.db.add(package)
        self.db.flush()
        self._await_approval(
            case,
            user,
            package,
            at,
            "package.built",
            replaced=current,
            approval_revoked=replaced_approval is not None,
        )
        return package

    def _await_approval(
        self,
        case: DataQsCase,
        user: User,
        package: DataQsPackage,
        at: datetime,
        action: str,
        *,
        replaced: DataQsPackage | None,
        approval_revoked: bool = False,
    ) -> None:
        before = {"work_status": case.work_status.value}
        self.repository.complete_tasks(
            case, {"PREPARE_PACKAGE", "REVISE_PACKAGE", "APPROVE_PACKAGE", "FILE_REQUEST"}, user, at
        )
        case.work_status, case.action_owner = (
            DataQsWorkStatus.AWAITING_APPROVAL,
            DataQsActionOwner.CARRIER,
        )
        self.repository.add_task(
            case,
            "APPROVE_PACKAGE",
            f"Review and approve request package v{package.package_version}",
            DataQsActionOwner.CARRIER,
        ).due_at = at + CARRIER_APPROVAL_TARGET
        self.db.flush()
        DataQsNotifications(self.db).to_carrier(
            case,
            "PACKAGE_READY",
            f"Please review and approve your DataQs request (case #{case.id})",
            f"STS has prepared the DataQs request for inspection {case.source_event_id} "
            f"(package v{package.package_version}).\n\nPlease read it and approve it, or tell us "
            "what to change. STS files it with FMCSA only once you approve this exact version.",
        )
        self.repository.audit(
            case,
            user,
            action,
            before=before,
            after={
                "package_version": package.package_version,
                "manifest_hash": package.manifest_hash,
                "replaced_version": replaced.package_version if replaced else None,
                "approval_revoked": approval_revoked,
            },
        )
        self.db.commit()

    def _manifest(self, case: DataQsCase, body: DataQsPackageIn) -> dict[str, Any]:
        settings = get_settings()
        issues = self.repository.issues([case.id])
        appeal = next(
            (c for c in reversed(self.repository.review_cycles(case.id)) if c.submitted_at is None),
            None,
        )
        if appeal is not None and appeal.appealed_issue_ids:
            issues = [i for i in issues if i.id in appeal.appealed_issue_ids]
        evidence = {e.id: e for e in self.repository.evidence([case.id])}
        chosen = list(dict.fromkeys(body.evidence_ids))
        unknown = [i for i in chosen if i not in evidence]
        if unknown:
            raise ValidationError(f"Evidence {unknown} is not part of this case")
        infected = [i for i in chosen if evidence[i].scan_status == DataQsScanStatus.INFECTED]
        if infected:
            raise ValidationError(f"Evidence {infected} failed the malware scan")
        links: dict[int, list[int]] = {}
        for link in self.repository.evidence_links(chosen):
            links.setdefault(link.evidence_id, []).append(link.issue_id)
        owner = self.repository.user_names([case.owner_id] if case.owner_id else [])
        organization = self.repository.organization_names([case.organization_id])
        narrative = body.narrative.strip()
        return {
            "format": MANIFEST_FORMAT,
            "case_id": case.id,
            "package_version": None,  # set once the version is known
            "review_level": appeal.level.value if appeal else "INITIAL",
            "appeal_of_cycle_id": appeal.parent_cycle_id if appeal else None,
            "carrier": {
                "usdot_number": case.usdot_number,
                "legal_name": case.source_snapshot.get("carrier_name"),
                "company": organization.get(case.organization_id),
            },
            "representative": {
                "company": settings.dataqs_representative_company,
                "email": settings.dataqs_representative_email,
                "phone": settings.dataqs_representative_phone,
                "specialist": owner.get(case.owner_id) if case.owner_id else None,
            },
            "event": {
                "type": case.event_type.value,
                "source_event_id": case.source_event_id,
                "inspection_report_number": case.inspection_report_number,
                "citation_number": case.citation_number,
                "police_report_number": case.police_report_number,
                "date": case.event_date.isoformat() if case.event_date else None,
                "state": case.event_state,
            },
            "issues": [
                {
                    "issue_id": i.id,
                    "violation_code": i.violation_code,
                    "violation_unit": i.violation_unit,
                    "description": (i.violation_snapshot or {}).get("description"),
                    "reason": i.reason.value,
                    "recorded_value": i.recorded_value,
                    "requested_value": i.requested_value,
                }
                for i in issues
            ],
            # DataQs step 3 (one reason per request) and step 4
            "dataqs_reason": body.dataqs_reason.value,
            "dataqs_reason_label": DATAQS_REASON[body.dataqs_reason],
            "viewed_in": body.viewed_in.strip(),
            "narrative_sha256": sha256_text(narrative),
            "evidence": [
                {
                    "evidence_id": e.id,
                    "file_name": e.file_name,
                    "title": e.title or e.file_name,
                    "mime_type": e.mime_type,
                    "size_bytes": e.size_bytes,
                    "sha256": e.sha256,
                    "document_date": e.document_date.isoformat() if e.document_date else None,
                    "scan_status": e.scan_status.value,
                    "issue_ids": sorted(links.get(e.id, [])),
                }
                for e in (evidence[i] for i in chosen)
            ],
            "references": body.references,
        }

    # --- Carrier: approve or ask for changes ----------------------------------------------------

    def _carrier_case(self, user: User, case_id: int, expected_version: int) -> DataQsCase:
        case = self.access.case_to_act_on(user, case_id)
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError("The carrier's account owner approves the package")
        if case.work_status != DataQsWorkStatus.AWAITING_APPROVAL:
            raise DataQsInvalidTransitionError("There is no package waiting for your approval")
        check_version(case, expected_version)
        return case

    def approve(self, user: User, case_id: int, body: DataQsApprovalIn) -> DataQsCase:
        case = self.access.case_to_act_on(user, case_id)
        current = self.repository.current_package(case.id)
        if case.work_status == DataQsWorkStatus.READY_TO_FILE and current is not None:
            approval = self.repository.current_approval(case.id)
            if approval is not None and approval.package_hash == body.package_hash:
                return case  # already approved: a repeated click changes nothing
        case = self._carrier_case(user, case_id, body.expected_version)
        if current is None or current.id != body.package_id:
            raise DataQsStaleVersionError("The package changed since you opened it; reload it")
        if current.manifest_hash != body.package_hash:
            raise DataQsStaleVersionError("The package changed since you opened it; reload it")
        if body.terms_version != PACKAGE_TERMS_VERSION:
            raise DataQsStaleVersionError("The approval text changed; reload and read it again")

        at = now()
        self.db.add(
            DataQsAuthorization(
                case_id=case.id,
                kind=DataQsAuthorizationKind.PACKAGE_APPROVAL,
                signer_id=user.id,
                signer_name=body.signer_name.strip(),
                signer_title=(body.signer_title or "").strip() or None,
                authority_check={
                    "role": user.role.value,
                    "organization_id": user.organization_id,
                    "usdot_number": case.usdot_number,
                    "carrier_verified_by_sts": True,
                    "checked_at": at.isoformat(),
                },
                scope=(
                    f"File request package v{current.package_version} "
                    f"(fingerprint {current.manifest_hash}) with FMCSA DataQs, exactly as approved."
                ),
                terms_version=PACKAGE_TERMS_VERSION,
                package_id=current.id,
                package_hash=current.manifest_hash,
                approved_at=at,
            )
        )
        self.repository.complete_tasks(case, {"APPROVE_PACKAGE"}, user, at)
        case.work_status, case.action_owner = DataQsWorkStatus.READY_TO_FILE, DataQsActionOwner.STS
        self.repository.add_task(
            case,
            "FILE_REQUEST",
            f"File package v{current.package_version} with DataQs and record the receipt",
            DataQsActionOwner.STS,
            assignee_id=case.owner_id,
        )
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "package.approved",
            before={"work_status": DataQsWorkStatus.AWAITING_APPROVAL.value},
            after={
                "work_status": case.work_status.value,
                "package_version": current.package_version,
                "manifest_hash": current.manifest_hash,
            },
        )
        self.db.commit()
        return case

    def request_changes(self, user: User, case_id: int, body: DataQsChangesIn) -> DataQsCase:
        case = self._carrier_case(user, case_id, body.expected_version)
        message = body.message.strip()
        at = now()
        self.repository.complete_tasks(case, {"APPROVE_PACKAGE"}, user, at)
        case.work_status, case.action_owner = DataQsWorkStatus.STAFF_REVIEW, DataQsActionOwner.STS
        self.repository.add_task(
            case,
            "REVISE_PACKAGE",
            "The carrier asked for changes to the package",
            DataQsActionOwner.STS,
            detail=message,
            assignee_id=case.owner_id,
        )
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "package.changes_requested",
            before={"work_status": DataQsWorkStatus.AWAITING_APPROVAL.value},
            after={"work_status": case.work_status.value, "message": message},
        )
        self.db.commit()
        return case
