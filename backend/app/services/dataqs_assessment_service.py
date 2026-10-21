"""STS assessment of a submitted DataQs case (docs/DataQ.md, Phase 3).

- Any STS staff member can assign the case specialist (owner) and assess a case in STAFF_REVIEW or
  EVIDENCE_NEEDED. Each assessment answers every check (PASS / ISSUE / NA) and records one outcome:
  - READY_TO_PREPARE: no check may be an ISSUE; STS builds the package next.
  - EVIDENCE_NEEDED: back to the carrier with a message saying what is missing.
  - PENDING_EXTERNAL / SPECIALIST_REVIEW: stays with STS.
  - INSUFFICIENT_BASIS: STS will not file it; the case closes, with a message to the carrier.
  `carrier_message` is shown to the carrier; `internal_note` only to STS.
- After adding evidence, the carrier's owner sends an EVIDENCE_NEEDED case back to STS.
Every write checks the case version the user saw and appends an audit event.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.exceptions import (
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    DataQsStaleVersionError,
    ValidationError,
)
from app.models import DataQsAssessment, DataQsCase, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsAssessmentOutcome,
    DataQsWorkStatus,
    UserRole,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import DataQsAssessmentIn, DataQsCheckDefOut
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_notifications import DataQsNotifications

ASSESSMENT_CHECKS = [
    DataQsCheckDefOut(
        key="carrier_authority",
        label="Carrier authority",
        hint="The signer can act for the carrier; the carrier is verified for this company.",
    ),
    DataQsCheckDefOut(
        key="record_identity",
        label="Record identity",
        hint="The inspection, report number and violations match FMCSA's record.",
    ),
    DataQsCheckDefOut(
        key="request_category",
        label="Request category",
        hint="The reason fits a DataQs request type (or belongs elsewhere, e.g. CPDP).",
    ),
    DataQsCheckDefOut(
        key="timing",
        label="Timing",
        hint="Within the state review window; boundary dates confirmed.",
    ),
    DataQsCheckDefOut(
        key="duplicates",
        label="Duplicates",
        hint="No earlier or open request covers the same grounds.",
    ),
    DataQsCheckDefOut(
        key="evidence",
        label="Evidence",
        hint="Each issue is supported by records from the time of the inspection.",
    ),
    DataQsCheckDefOut(
        key="state_plan",
        label="State plan",
        hint="The reviewing state's DataQs plan and any state-specific requirements.",
    ),
]
CHECK_KEYS = {check.key for check in ASSESSMENT_CHECKS}

OUTCOME_LABELS = {
    DataQsAssessmentOutcome.READY_TO_PREPARE: "Ready to prepare",
    DataQsAssessmentOutcome.EVIDENCE_NEEDED: "Evidence needed",
    DataQsAssessmentOutcome.PENDING_EXTERNAL: "Pending external event",
    DataQsAssessmentOutcome.SPECIALIST_REVIEW: "Specialist review",
    DataQsAssessmentOutcome.INSUFFICIENT_BASIS: "Insufficient basis",
}

# STS's own targets (never shown as government rules).
ASSESS_TARGET = timedelta(days=3)
CARRIER_EVIDENCE_TARGET = timedelta(days=14)

ASSESSABLE = {DataQsWorkStatus.STAFF_REVIEW, DataQsWorkStatus.EVIDENCE_NEEDED}


def now() -> datetime:
    return datetime.now(UTC)


def check_version(case: DataQsCase, expected: int) -> None:
    if expected != case.row_version:
        raise DataQsStaleVersionError("This case changed since you opened it; reload it")


class DataQsAssessmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)

    def _staff_case(self, user: User, case_id: int, expected_version: int) -> DataQsCase:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff can do this")
        case = self.access.case_to_act_on(user, case_id)
        check_version(case, expected_version)
        return case

    def assign_owner(
        self, user: User, case_id: int, owner_id: int | None, expected_version: int
    ) -> DataQsCase:
        case = self._staff_case(user, case_id, expected_version)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed")
        if owner_id is not None and owner_id not in {u.id for u in self.repository.staff_users()}:
            raise ValidationError("The owner must be an active STS staff member")
        before = {"owner_id": case.owner_id}
        case.owner_id = owner_id
        for task in self.repository.open_tasks([case.id]):
            if task.action_owner == DataQsActionOwner.STS:
                task.assignee_id = owner_id
        self.db.flush()
        self.repository.audit(
            case, user, "owner.changed", before=before, after={"owner_id": owner_id}
        )
        self.db.commit()
        return case

    def assess(self, user: User, case_id: int, body: DataQsAssessmentIn) -> DataQsCase:
        case = self._staff_case(user, case_id, body.expected_version)
        if case.work_status not in ASSESSABLE:
            raise DataQsInvalidTransitionError("This case is not waiting for an assessment")
        if set(body.checks) != CHECK_KEYS:
            raise ValidationError("Answer every check: " + ", ".join(sorted(CHECK_KEYS)))
        outcome = body.outcome
        issues = [key for key, check in body.checks.items() if check.result == "ISSUE"]
        if outcome == DataQsAssessmentOutcome.READY_TO_PREPARE and issues:
            raise ValidationError(
                "A case with a failed check can't be ready to prepare: " + ", ".join(issues)
            )
        carrier_message = (body.carrier_message or "").strip() or None
        if (
            outcome
            in (DataQsAssessmentOutcome.EVIDENCE_NEEDED, DataQsAssessmentOutcome.INSUFFICIENT_BASIS)
            and not carrier_message
        ):
            raise ValidationError("Tell the carrier what is needed or why STS won't file it")

        at = now()
        self.db.add(
            DataQsAssessment(
                case_id=case.id,
                assessor_id=user.id,
                outcome=outcome,
                checks={key: check.model_dump() for key, check in body.checks.items()},
                carrier_message=carrier_message,
                internal_note=(body.internal_note or "").strip() or None,
            )
        )
        before = {"work_status": case.work_status.value}
        if case.owner_id is None:
            case.owner_id = user.id  # whoever assesses an unowned case owns it
        self.repository.complete_tasks(case, {"ASSESS_CASE", "SPECIALIST_REVIEW"}, user, at)

        if outcome == DataQsAssessmentOutcome.EVIDENCE_NEEDED:
            case.work_status, case.action_owner = (
                DataQsWorkStatus.EVIDENCE_NEEDED,
                DataQsActionOwner.CARRIER,
            )
            self.repository.add_task(
                case,
                "UPLOAD_EVIDENCE",
                "Upload the evidence STS asked for, then send the case back",
                DataQsActionOwner.CARRIER,
                detail=carrier_message,
            ).due_at = at + CARRIER_EVIDENCE_TARGET
            self.db.flush()
            DataQsNotifications(self.db).to_carrier(
                case,
                "EVIDENCE_NEEDED",
                f"STS needs more information for DataQs case #{case.id}",
                f'{carrier_message}\n\nPlease upload it on the case, then choose "Send back '
                'to STS".',
            )
        elif outcome == DataQsAssessmentOutcome.INSUFFICIENT_BASIS:
            case.work_status, case.action_owner, case.closed_at = (
                DataQsWorkStatus.CLOSED,
                None,
                at,
            )
            for task in self.repository.open_tasks([case.id]):
                task.completed_at, task.completed_by_id = at, user.id
            self.db.flush()
            notifications = DataQsNotifications(self.db)
            notifications.cancel_pending(case)
            notifications.to_carrier(
                case,
                "FILE_CLOSED",
                f"Your DataQs file #{case.id} is closed",
                f"STS reviewed your request for inspection {case.source_event_id} and won't file "
                f"it with FMCSA.\n\n{carrier_message}",
            )
        else:
            case.work_status, case.action_owner = (
                DataQsWorkStatus.STAFF_REVIEW,
                DataQsActionOwner.STS,
            )
            kind, title = {
                DataQsAssessmentOutcome.READY_TO_PREPARE: (
                    "PREPARE_PACKAGE",
                    "Prepare the filing package",
                ),
                DataQsAssessmentOutcome.PENDING_EXTERNAL: (
                    "WAIT_EXTERNAL",
                    "Waiting on an outside event; reassess when it happens",
                ),
                DataQsAssessmentOutcome.SPECIALIST_REVIEW: (
                    "SPECIALIST_REVIEW",
                    "Specialist review of the case",
                ),
            }[outcome]
            self.repository.add_task(
                case,
                kind,
                title,
                DataQsActionOwner.STS,
                assignee_id=None if kind == "SPECIALIST_REVIEW" else case.owner_id,
            )
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "case.assessed",
            before=before,
            after={"outcome": outcome.value, "work_status": case.work_status.value},
        )
        self.db.commit()
        return case

    def resubmit(self, user: User, case_id: int, expected_version: int) -> DataQsCase:
        """The carrier added the evidence STS asked for: back to STS for assessment."""
        case = self.access.case_to_act_on(user, case_id)
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError("The carrier's account owner sends the case back")
        if case.work_status != DataQsWorkStatus.EVIDENCE_NEEDED:
            if case.work_status == DataQsWorkStatus.STAFF_REVIEW:
                return case  # already sent: a repeated click changes nothing
            raise DataQsInvalidTransitionError("STS has not asked for more evidence on this case")
        check_version(case, expected_version)
        at = now()
        self.repository.complete_tasks(case, {"UPLOAD_EVIDENCE"}, user, at)
        case.work_status, case.action_owner = DataQsWorkStatus.STAFF_REVIEW, DataQsActionOwner.STS
        self.repository.add_task(
            case,
            "ASSESS_CASE",
            f"Reassess DataQs case #{case.id} with the new evidence",
            DataQsActionOwner.STS,
            assignee_id=case.owner_id,
        ).due_at = at + ASSESS_TARGET
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "case.resubmitted",
            before={"work_status": DataQsWorkStatus.EVIDENCE_NEEDED.value},
            after={"work_status": case.work_status.value},
        )
        self.db.commit()
        return case
