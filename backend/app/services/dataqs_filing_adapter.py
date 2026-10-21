"""Filing a DataQs request (docs/DataQ.md, Phase 4).

There is no public DataQs filing API, so filing is manual: an STS specialist signs in to the
DataQs portal with their own authorized account, enters the approved narrative, uploads the
approved files and submits. This module records that work so it is never lost or done twice.
Only the filing account's identity is stored, never a password, MFA secret or session.

The spec's adapter contract, and how the manual adapter meets it:
- prepare_package(case_id): the approved package to file (shown on the case page).
- record_attempt(case_id): `start`, before the specialist submits in DataQs. One open attempt
  at a time, so two people never file the same request.
- confirm_submission(attempt_id, receipt): `confirm`, with the request ID and acknowledgement
  DataQs showed. Only then is the case submitted (MONITORING); a saved draft is not a submission.
- reconcile(case_id): an attempt whose outcome is unknown (the portal timed out) is marked
  UNCONFIRMED and blocks a blind retry. The specialist searches DataQs, then either confirms
  the request found there or abandons the attempt (not found) and files again.
- record_correspondence(case_id, source): Phase 5.
A future approved connector can implement the same steps automatically.
"""

from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy.orm import Session

from app.core.exceptions import (
    DataQsDuplicateCaseError,
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    DataQsStaleVersionError,
    NotFoundError,
    ValidationError,
)
from app.models import (
    DataQsCase,
    DataQsCorrespondence,
    DataQsPackage,
    DataQsReviewCycle,
    DataQsSubmissionAttempt,
    User,
)
from app.models.enums import (
    DataQsActionOwner,
    DataQsAttemptStatus,
    DataQsClockType,
    DataQsCorrespondenceKind,
    DataQsCorrespondenceSource,
    DataQsReviewLevel,
    DataQsWorkStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import DataQsAttemptStartIn, DataQsConfirmIn
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_clock_service import DataQsClockService

# The agency should open a request within 7 days of submission [S3]: STS checks that it did.
OPENING_CHECKPOINT = timedelta(days=7)
CLOCK_SKEW = timedelta(minutes=10)  # a filing time slightly ahead of the server's clock is fine


class FilingAdapter(Protocol):
    """The filing contract (spec: preparePackage, recordAttempt, confirmSubmission, reconcile)."""

    def prepare_package(self, user: User, case_id: int) -> DataQsPackage: ...

    def start(
        self, user: User, case_id: int, body: DataQsAttemptStartIn, key: str | None
    ) -> DataQsSubmissionAttempt: ...

    def confirm(
        self, user: User, case_id: int, attempt_id: int, body: DataQsConfirmIn
    ) -> DataQsSubmissionAttempt: ...

    def mark_unconfirmed(
        self, user: User, case_id: int, attempt_id: int, note: str
    ) -> DataQsSubmissionAttempt: ...

    def abandon(
        self, user: User, case_id: int, attempt_id: int, note: str
    ) -> DataQsSubmissionAttempt: ...


def _now() -> datetime:
    return datetime.now(UTC)


class ManualFilingAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.clocks = DataQsClockService(db)

    def _staff_case(self, user: User, case_id: int) -> DataQsCase:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff file DataQs requests")
        return self.access.case_to_act_on(user, case_id)

    def _attempt(self, case: DataQsCase, attempt_id: int) -> DataQsSubmissionAttempt:
        attempt = self.db.get(DataQsSubmissionAttempt, attempt_id)
        if attempt is None or attempt.case_id != case.id:
            raise NotFoundError(f"Filing attempt {attempt_id} not found on case {case.id}")
        return attempt

    def prepare_package(self, user: User, case_id: int) -> DataQsPackage:
        """The package the carrier approved: exactly what to enter in DataQs."""
        case = self._staff_case(user, case_id)
        approval = self.repository.current_approval(case.id)
        package = self.repository.current_package(case.id)
        if approval is None or package is None:
            raise DataQsInvalidTransitionError("The carrier has not approved the current package")
        return package

    # --- record_attempt --------------------------------------------------------------------------

    def start(
        self, user: User, case_id: int, body: DataQsAttemptStartIn, key: str | None
    ) -> DataQsSubmissionAttempt:
        case = self._staff_case(user, case_id)
        if key:
            existing = self.repository.attempt_by_key(case.id, key)
            if existing is not None:
                return existing  # the same click, sent again
        open_attempt = self.repository.open_attempt(case.id)
        if open_attempt is not None:
            raise DataQsInvalidTransitionError(
                f"Filing attempt #{open_attempt.id} is still open: confirm it, or settle it "
                "against DataQs, before starting another"
            )
        if case.work_status != DataQsWorkStatus.READY_TO_FILE:
            raise DataQsInvalidTransitionError("This case is not ready to file")
        package = self.prepare_package(user, case_id)
        if package.id != body.package_id or package.manifest_hash != body.package_hash:
            raise DataQsStaleVersionError(
                "That isn't the package the carrier approved; reload the case"
            )

        attempt = DataQsSubmissionAttempt(
            case_id=case.id,
            package_id=package.id,
            status=DataQsAttemptStatus.STARTED,
            filed_by_id=user.id,
            filing_account=body.filing_account.strip(),
            idempotency_key=key,
        )
        self.db.add(attempt)
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "filing.started",
            after={"attempt_id": attempt.id, "package_version": package.package_version},
        )
        self.db.commit()
        return attempt

    # --- confirm_submission ----------------------------------------------------------------------

    def confirm(
        self, user: User, case_id: int, attempt_id: int, body: DataQsConfirmIn
    ) -> DataQsSubmissionAttempt:
        case = self._staff_case(user, case_id)
        attempt = self._attempt(case, attempt_id)
        if attempt.status == DataQsAttemptStatus.CONFIRMED:
            if attempt.gov_request_id == body.gov_request_id:
                return attempt  # already recorded: a repeat adds nothing
            raise DataQsDuplicateCaseError(
                f"This attempt is already confirmed as DataQs request {attempt.gov_request_id}"
            )
        if attempt.status == DataQsAttemptStatus.ABANDONED:
            raise DataQsInvalidTransitionError("This attempt was abandoned; start a new one")

        package = self.db.get(DataQsPackage, attempt.package_id)
        assert package is not None
        if body.package_version != package.package_version:
            raise ValidationError(
                f"This attempt is for package v{package.package_version}; record the version "
                "you entered in DataQs only if it is that one"
            )
        approval = self.repository.current_approval(case.id)
        if approval is None or approval.package_id != package.id:
            raise DataQsStaleVersionError("The approved package changed after filing started")
        at = _now()
        if body.filed_at > at + CLOCK_SKEW:
            raise ValidationError("The filing time is in the future")
        if body.filed_at < approval.approved_at - CLOCK_SKEW:
            raise ValidationError("The filing time is before the carrier approved the package")
        other = self.repository.case_by_gov_request_id(case.route, body.gov_request_id)
        if other is not None and other.id != case.id:
            raise DataQsDuplicateCaseError(
                f"DataQs request {body.gov_request_id} is already recorded on case #{other.id}"
            )

        before = {"work_status": case.work_status.value}
        attempt.status = DataQsAttemptStatus.CONFIRMED
        attempt.filed_at, attempt.confirmed_at = body.filed_at, at
        attempt.gov_request_id = body.gov_request_id
        attempt.assigned_agency = (body.assigned_agency or "").strip() or None
        attempt.receipt = {
            "acknowledgement": body.acknowledgement.strip(),
            "portal_status": body.portal_status,
            "package_version": package.package_version,
            "manifest_hash": package.manifest_hash,
            "recorded_by": user.id,
        }
        case.gov_request_id = body.gov_request_id
        if body.portal_status:
            case.government_raw_status = body.portal_status.strip()
        case.work_status, case.action_owner = DataQsWorkStatus.MONITORING, DataQsActionOwner.AGENCY
        # The first filing opens the initial review; an appeal's filing opens the stage STS
        # proposed (Phase 5). Either way the stage's full review budget starts now.
        cycles = self.repository.review_cycles(case.id)
        cycle = next((c for c in reversed(cycles) if c.submitted_at is None), None)
        if cycle is None:
            cycle = DataQsReviewCycle(
                case_id=case.id,
                level=DataQsReviewLevel.INITIAL,
                cycle_number=1,
                opened_reason="First filing",
            )
            self.db.add(cycle)
        cycle.submitted_at = body.filed_at
        case.review_level, case.outcome = cycle.level, None
        self.db.flush()
        self.clocks.stop(case, {DataQsClockType.APPEAL})
        self.clocks.start_agency(case, cycle, body.filed_at)
        self.db.add(
            DataQsCorrespondence(
                case_id=case.id,
                source=DataQsCorrespondenceSource.DATAQS_PORTAL,
                kind=DataQsCorrespondenceKind.ACKNOWLEDGEMENT,
                inbound=True,
                external_id=body.gov_request_id,
                original_payload=body.acknowledgement.strip(),
                received_at=body.filed_at,
                recorded_by_id=user.id,
                verified_by_id=user.id,
                verified_at=at,
            )
        )
        self.repository.complete_tasks(case, {"FILE_REQUEST", "RECONCILE_FILING"}, user, at)
        self.repository.add_task(
            case,
            "CHECK_OPENED",
            f"Check DataQs that the agency opened request {body.gov_request_id}",
            DataQsActionOwner.STS,
            detail="Agencies open requests within 7 days of submission.",
            assignee_id=case.owner_id,
        ).due_at = body.filed_at + OPENING_CHECKPOINT
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "filing.confirmed",
            before=before,
            after={
                "attempt_id": attempt.id,
                "gov_request_id": body.gov_request_id,
                "filed_at": body.filed_at.isoformat(),
                "package_version": package.package_version,
                "review_level": cycle.level.value,
                "work_status": case.work_status.value,
            },
        )
        self.db.commit()
        return attempt

    # --- reconcile -------------------------------------------------------------------------------

    def mark_unconfirmed(
        self, user: User, case_id: int, attempt_id: int, note: str
    ) -> DataQsSubmissionAttempt:
        """The portal timed out or the result is unclear: block retries until checked."""
        case = self._staff_case(user, case_id)
        attempt = self._attempt(case, attempt_id)
        if attempt.status == DataQsAttemptStatus.UNCONFIRMED:
            return attempt
        if attempt.status != DataQsAttemptStatus.STARTED:
            raise DataQsInvalidTransitionError("Only an attempt in progress can be unconfirmed")
        at = _now()
        attempt.status, attempt.note = DataQsAttemptStatus.UNCONFIRMED, note.strip()
        before = {"work_status": case.work_status.value}
        case.work_status = DataQsWorkStatus.SUBMISSION_UNCONFIRMED
        self.repository.add_task(
            case,
            "RECONCILE_FILING",
            "Search DataQs for this inspection: confirm the request if it exists, or mark it "
            "not found before filing again",
            DataQsActionOwner.STS,
            detail=note.strip(),
            assignee_id=case.owner_id,
        ).due_at = at + timedelta(days=1)
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "filing.unconfirmed",
            before=before,
            after={"attempt_id": attempt.id, "note": attempt.note},
        )
        self.db.commit()
        return attempt

    def abandon(
        self, user: User, case_id: int, attempt_id: int, note: str
    ) -> DataQsSubmissionAttempt:
        """Nothing was submitted (or DataQs shows no such request): the case is ready to file."""
        case = self._staff_case(user, case_id)
        attempt = self._attempt(case, attempt_id)
        if attempt.status == DataQsAttemptStatus.ABANDONED:
            return attempt
        if attempt.status == DataQsAttemptStatus.CONFIRMED:
            raise DataQsInvalidTransitionError("A confirmed filing can't be abandoned")
        at = _now()
        attempt.status, attempt.note = DataQsAttemptStatus.ABANDONED, note.strip()
        before = {"work_status": case.work_status.value}
        case.work_status = DataQsWorkStatus.READY_TO_FILE
        self.repository.complete_tasks(case, {"RECONCILE_FILING"}, user, at)
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "filing.abandoned",
            before=before,
            after={"attempt_id": attempt.id, "note": attempt.note},
        )
        self.db.commit()
        return attempt
