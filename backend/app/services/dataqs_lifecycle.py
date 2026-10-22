"""After filing: agency correspondence, decisions, appeals and reopenings (docs/DataQ.md, Phase 5).

STS staff record each verified agency event (the spec's record_correspondence). Only these move
the case's stage or clocks; uploading a document never does.

- INFO_REQUEST: the agency asks the requester for information. The exact question is kept, the
  agency review clock pauses, and a 14-day answer deadline and task start.
- INFO_RESPONSE: STS answered in DataQs. The agency clock resumes with its remaining time.
- DECISION: kept as issued (date, reviewer, reasons, appeal instructions), with an outcome per
  issue. Corrected issues go to verification (Phase 6); denied ones stay open for an appeal,
  whose 30 days run from the decision's issue date. A procedural closure (insufficient
  information, no response) is kept apart from a denial on the merits. After a final review the
  normal escalation route is closed (FMCSA is not an automatic fourth appeal).
- REOPENING: the agency reopens the same level (requested information supplied after closure:
  a fresh full period) or returns the case to initial review (new evidence at appeal). Either
  way a new, linked cycle starts; earlier cycles are never overwritten.
- A reconsideration or final decision by a reviewer named in an earlier decision is flagged for
  STS to check reviewer independence.

Appeals: STS proposes the next stage with grounds that address the decision and the issues
appealed (propose_review). It then goes through assessment, a new package and the carrier's
approval, and is filed through the Phase 4 console like the first request.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import (
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    ValidationError,
)
from app.models import DataQsCase, DataQsCorrespondence, DataQsReviewCycle, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsClockType,
    DataQsCorrespondenceKind,
    DataQsOutcome,
    DataQsReviewLevel,
    DataQsWorkStatus,
    UserRole,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsClockOverrideIn,
    DataQsCloseIn,
    DataQsCorrespondenceIn,
    DataQsMessageIn,
    DataQsReviewRequestIn,
)
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_assessment_service import ASSESS_TARGET, check_version
from app.services.dataqs_clock_service import DataQsClockService
from app.services.dataqs_filing_adapter import CLOCK_SKEW
from app.services.dataqs_notifications import DataQsNotifications
from app.services.dataqs_verification_service import start_verification, unverified

NEXT_LEVEL = {
    DataQsReviewLevel.INITIAL: DataQsReviewLevel.RECONSIDERATION,
    DataQsReviewLevel.RECONSIDERATION: DataQsReviewLevel.FINAL,
}
LEVEL_LABEL = {
    DataQsReviewLevel.INITIAL: "initial review",
    DataQsReviewLevel.RECONSIDERATION: "reconsideration",
    DataQsReviewLevel.FINAL: "final review",
}
PROCEDURAL_LABEL = {
    "INSUFFICIENT_INFORMATION": "insufficient information",
    "NO_RESPONSE": "no response to the agency's request",
}


def _now() -> datetime:
    return datetime.now(UTC)


def submitted_cycles(cycles: list[DataQsReviewCycle]) -> list[DataQsReviewCycle]:
    return [c for c in cycles if c.submitted_at is not None]


def proposed_cycle(cycles: list[DataQsReviewCycle]) -> DataQsReviewCycle | None:
    """An appeal STS proposed that has not been filed yet."""
    return next((c for c in reversed(cycles) if c.submitted_at is None), None)


def covered_issue_ids(cycle: DataQsReviewCycle, all_issue_ids: list[int]) -> list[int]:
    """The issues a cycle decides: an appeal's appealed issues, otherwise all of them."""
    return list(cycle.appealed_issue_ids) if cycle.appealed_issue_ids else all_issue_ids


class DataQsLifecycleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.clocks = DataQsClockService(db)
        self.notifications = DataQsNotifications(db)

    def _staff_case(self, user: User, case_id: int, expected_version: int) -> DataQsCase:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff record DataQs events")
        case = self.access.case_to_act_on(user, case_id)
        check_version(case, expected_version)
        return case

    # --- record_correspondence --------------------------------------------------------------------

    def record(self, user: User, case_id: int, body: DataQsCorrespondenceIn) -> DataQsCase:
        case = self._staff_case(user, case_id, body.expected_version)
        if case.gov_request_id is None:
            raise DataQsInvalidTransitionError("Record agency events once the request is filed")
        at = _now()
        if body.occurred_at > at:
            raise ValidationError("The date is in the future")
        kind = DataQsCorrespondenceKind(body.kind)
        cycles = self.repository.review_cycles(case.id)
        current = submitted_cycles(cycles)[-1] if submitted_cycles(cycles) else None
        if current is None:
            raise DataQsInvalidTransitionError("This case has no filed review stage")
        assert current.submitted_at is not None
        if body.occurred_at < current.submitted_at - CLOCK_SKEW:
            raise ValidationError("The date is before this review stage was filed")
        inbound = kind != DataQsCorrespondenceKind.INFO_RESPONSE
        item = DataQsCorrespondence(
            case_id=case.id,
            cycle_id=current.id,
            source=body.source,
            kind=kind,
            inbound=inbound,
            external_id=body.external_id,
            original_payload=body.text.strip(),
            sent_at=body.occurred_at if not inbound else None,
            received_at=body.occurred_at if inbound else None,
            recorded_by_id=user.id,
            verified_by_id=user.id,
            verified_at=at,
        )
        self.db.add(item)
        self.db.flush()
        if body.portal_status:
            case.government_raw_status = body.portal_status.strip()

        before = {"work_status": case.work_status.value}
        detail: dict[str, Any] = {"kind": kind.value, "occurred_at": body.occurred_at.isoformat()}
        if kind == DataQsCorrespondenceKind.OPENED:
            self._opened(user, case, current, body, at)
        elif kind == DataQsCorrespondenceKind.INFO_REQUEST:
            self._info_request(user, case, current, item, body, at)
        elif kind == DataQsCorrespondenceKind.INFO_RESPONSE:
            self._info_response(user, case, item, body, at)
        elif kind == DataQsCorrespondenceKind.DECISION:
            detail.update(self._decision(user, case, current, cycles, body, at))
        elif kind == DataQsCorrespondenceKind.REOPENING:
            detail.update(self._reopening(user, case, cycles, body, at))
        self.db.flush()
        self.repository.audit(
            case,
            user,
            f"agency.{kind.value.lower()}",
            before=before,
            after={**detail, "work_status": case.work_status.value},
        )
        self.db.commit()
        return case

    def _opened(
        self,
        user: User,
        case: DataQsCase,
        current: DataQsReviewCycle,
        body: DataQsCorrespondenceIn,
        at: datetime,
    ) -> None:
        """DataQs history shows "Opened" by the assigned agency: the 7-day check is done."""
        if current.decision_issued_at is not None:
            raise DataQsInvalidTransitionError("This review stage is already decided")
        self.repository.complete_tasks(case, {"CHECK_OPENED"}, user, at)
        agency = (body.assigned_agency or "").strip()
        if agency:
            confirmed = [
                a for a in self.repository.attempts(case.id) if a.status.value == "CONFIRMED"
            ]
            if confirmed:
                confirmed[-1].assigned_agency = agency

    def _info_request(
        self,
        user: User,
        case: DataQsCase,
        current: DataQsReviewCycle,
        item: DataQsCorrespondence,
        body: DataQsCorrespondenceIn,
        at: datetime,
    ) -> None:
        if case.work_status != DataQsWorkStatus.MONITORING or current.decision_issued_at:
            raise DataQsInvalidTransitionError("The agency isn't reviewing this case right now")
        self.clocks.pause_agency(case, body.occurred_at, item.id)
        deadline = self.clocks.start_requester_info(case, body.occurred_at)
        self.repository.add_task(
            case,
            "ANSWER_INFO_REQUEST",
            "Answer the agency's information request in DataQs",
            DataQsActionOwner.STS,
            detail=body.text.strip(),
            assignee_id=case.owner_id,
        ).due_at = deadline.due_at
        case.action_owner = DataQsActionOwner.STS

    def _info_response(
        self,
        user: User,
        case: DataQsCase,
        item: DataQsCorrespondence,
        body: DataQsCorrespondenceIn,
        at: datetime,
    ) -> None:
        if self.clocks.active(case, DataQsClockType.REQUESTER_INFO) is None:
            raise DataQsInvalidTransitionError("There is no open information request to answer")
        self.clocks.resume_agency(case, body.occurred_at, item.id)
        self.clocks.stop(case, {DataQsClockType.REQUESTER_INFO})
        self.repository.complete_tasks(case, {"ANSWER_INFO_REQUEST"}, user, at)
        case.action_owner = DataQsActionOwner.AGENCY

    def _decision(
        self,
        user: User,
        case: DataQsCase,
        current: DataQsReviewCycle,
        cycles: list[DataQsReviewCycle],
        body: DataQsCorrespondenceIn,
        at: datetime,
    ) -> dict[str, Any]:
        decision = body.decision
        if decision is None:
            raise ValidationError("Record the decision's details")
        if current.decision_issued_at is not None:
            raise DataQsInvalidTransitionError("This review stage already has a decision recorded")
        issues = {i.id: i for i in self.repository.issues([case.id])}
        covered = covered_issue_ids(current, list(issues))
        if decision.procedural_reason is None:
            missing = [i for i in covered if i not in decision.issue_outcomes]
            extra = [i for i in decision.issue_outcomes if i not in covered]
            if missing or extra:
                raise ValidationError(
                    "Give an outcome for each issue this stage decided: "
                    + ", ".join(map(str, covered))
                )
            corrected = [i for i in covered if decision.issue_outcomes[i] == "CORRECTED"]
            outcome = (
                DataQsOutcome.FULL_CORRECTION
                if len(corrected) == len(covered)
                else DataQsOutcome.NO_CORRECTION
                if not corrected
                else DataQsOutcome.PARTIAL_CORRECTION
            )
            for issue_id in covered:
                issue = issues[issue_id]
                fixed = decision.issue_outcomes[issue_id] == "CORRECTED"
                issue.outcome = (
                    DataQsOutcome.FULL_CORRECTION if fixed else DataQsOutcome.NO_CORRECTION
                )
                issue.outcome_reason = decision.reasons
                issue.resolved_at = body.occurred_at if fixed else None
                if fixed:
                    start_verification(issue)  # until FMCSA's data shows it (Phase 6)
                else:
                    issue.verification_status = None
        else:
            outcome = DataQsOutcome.PROCEDURAL_CLOSURE

        decided_by = (decision.decided_by or "").strip() or None
        concern = None
        if decided_by and current.level != DataQsReviewLevel.INITIAL:
            earlier = {
                (c.decided_by or "").strip().lower()
                for c in cycles
                if c.id != current.id and c.decided_by
            }
            if decided_by.lower() in earlier:
                concern = (
                    f"{decided_by} also decided an earlier stage; a {LEVEL_LABEL[current.level]} "
                    "must be independent of earlier decisions."
                )
        current.decision_issued_at = body.occurred_at
        current.outcome, current.decided_by, current.closed_at = (
            outcome,
            decided_by,
            body.occurred_at,
        )
        current.decision = {
            "reasons": decision.reasons,
            "appeal_instructions": decision.appeal_instructions,
            "issue_outcomes": {str(k): v for k, v in decision.issue_outcomes.items()},
            "procedural_reason": decision.procedural_reason,
            "independence_concern": concern,
            "recorded_at": at.isoformat(),
        }
        case.outcome = outcome
        self.clocks.stop(case, {DataQsClockType.AGENCY_REVIEW, DataQsClockType.REQUESTER_INFO})
        self.repository.complete_tasks(case, {"CHECK_OPENED", "ANSWER_INFO_REQUEST"}, user, at)
        if concern:
            self.repository.add_task(
                case,
                "INDEPENDENCE_CONCERN",
                "Check the reviewer's independence before the next step",
                DataQsActionOwner.STS,
                detail=concern,
                assignee_id=case.owner_id,
            )

        final = current.level == DataQsReviewLevel.FINAL
        if outcome in (DataQsOutcome.FULL_CORRECTION, DataQsOutcome.PARTIAL_CORRECTION):
            case.work_status, case.action_owner = (
                DataQsWorkStatus.VERIFICATION,
                DataQsActionOwner.STS,
            )
            self.repository.add_task(
                case,
                "VERIFY_CORRECTION",
                "Check that FMCSA's record shows the correction",
                DataQsActionOwner.STS,
                assignee_id=case.owner_id,
            )
        elif outcome == DataQsOutcome.PROCEDURAL_CLOSURE:
            case.work_status, case.action_owner = (
                DataQsWorkStatus.STAFF_REVIEW,
                DataQsActionOwner.STS,
            )
            self.repository.add_task(
                case,
                "PROCEDURAL_CLOSURE",
                f"Closed for {PROCEDURAL_LABEL[decision.procedural_reason or '']}: decide whether "
                "to supply what was missing and ask the agency to reopen",
                DataQsActionOwner.STS,
                assignee_id=case.owner_id,
            )
        elif final:
            case.work_status, case.action_owner, case.closed_at = DataQsWorkStatus.CLOSED, None, at
            self.notifications.cancel_pending(case)
        else:
            case.work_status, case.action_owner = (
                DataQsWorkStatus.STAFF_REVIEW,
                DataQsActionOwner.STS,
            )
        if outcome in (DataQsOutcome.NO_CORRECTION, DataQsOutcome.PARTIAL_CORRECTION) and not final:
            appeal = self.clocks.start_appeal(case, current, body.occurred_at)
            self.repository.add_task(
                case,
                "APPEAL_DECISION",
                f"Decide whether to ask for {LEVEL_LABEL[NEXT_LEVEL[current.level]]} of the "
                "denied issues",
                DataQsActionOwner.STS,
                assignee_id=case.owner_id,
            ).due_at = appeal.due_at
        self.db.flush()
        self._decision_email(case, current, outcome, decision.reasons, final)
        return {"outcome": outcome.value, "level": current.level.value}

    def _decision_email(
        self,
        case: DataQsCase,
        cycle: DataQsReviewCycle,
        outcome: DataQsOutcome,
        reasons: str | None,
        final: bool,
    ) -> None:
        request = case.gov_request_id or f"case #{case.id}"
        result = {
            DataQsOutcome.FULL_CORRECTION: "the record will be corrected",
            DataQsOutcome.PARTIAL_CORRECTION: "part of the record will be corrected",
            DataQsOutcome.NO_CORRECTION: "the record was not changed",
            DataQsOutcome.PROCEDURAL_CLOSURE: "the agency closed it without deciding the merits",
        }.get(outcome, outcome.value.lower())
        if outcome in (DataQsOutcome.FULL_CORRECTION, DataQsOutcome.PARTIAL_CORRECTION):
            after = (
                "STS will check that FMCSA's data shows the correction. FMCSA's SMS and PSP "
                "update monthly, so it can take a few weeks to appear."
            )
        elif outcome == DataQsOutcome.PROCEDURAL_CLOSURE:
            after = "STS will look at supplying what was missing and asking the agency to reopen."
        elif final:
            after = (
                "This was the final review, so the normal DataQs appeal route is closed. Your "
                "file is now closed."
            )
        else:
            after = (
                f"STS is reviewing whether to ask for {LEVEL_LABEL[NEXT_LEVEL[cycle.level]]} "
                "within the 30-day appeal window, and will contact you."
            )
        body = (
            f"The agency decided the {LEVEL_LABEL[cycle.level]} of DataQs request {request} "
            f"(inspection {case.source_event_id}): {result}."
        )
        if reasons:
            body += f"\n\nReasons given: {reasons}"
        body += f"\n\n{after}"
        kind, subject = (
            ("FILE_CLOSED", f"Your DataQs file #{case.id} is closed")
            if final and case.work_status == DataQsWorkStatus.CLOSED
            else ("DECISION", f"Decision on your DataQs request {request}")
        )
        self.notifications.to_carrier(case, kind, subject, body)

    def _reopening(
        self,
        user: User,
        case: DataQsCase,
        cycles: list[DataQsReviewCycle],
        body: DataQsCorrespondenceIn,
        at: datetime,
    ) -> dict[str, Any]:
        reopening = body.reopening
        if reopening is None:
            raise ValidationError("Say how the agency reopened the request")
        filed = submitted_cycles(cycles)
        latest = filed[-1]
        if latest.decision_issued_at is None:
            raise DataQsInvalidTransitionError("The current stage is still under review")
        if proposed_cycle(cycles) is not None:
            raise DataQsInvalidTransitionError("Withdraw the proposed appeal before a reopening")
        level = latest.level if reopening.mode == "SAME_LEVEL" else DataQsReviewLevel.INITIAL
        number = 1 + max((c.cycle_number for c in cycles if c.level == level), default=0)
        reason = (
            f"Reopened at the same level: {reopening.reason.strip()}"
            if reopening.mode == "SAME_LEVEL"
            else f"Returned to initial review: {reopening.reason.strip()}"
        )
        cycle = DataQsReviewCycle(
            case_id=case.id,
            level=level,
            cycle_number=number,
            parent_cycle_id=latest.id,
            submitted_at=body.occurred_at,
            opened_reason=reason[:200],
            appealed_issue_ids=latest.appealed_issue_ids,
        )
        self.db.add(cycle)
        self.db.flush()
        for issue in self.repository.issues([case.id]):
            if issue.id in covered_issue_ids(cycle, [issue.id]) and issue.resolved_at is None:
                issue.outcome, issue.outcome_reason = None, None  # back under review
        self.clocks.stop(case, {DataQsClockType.APPEAL})
        self.clocks.start_agency(case, cycle, body.occurred_at)
        self.repository.complete_tasks(
            case,
            {"APPEAL_DECISION", "PROCEDURAL_CLOSURE", "VERIFY_CORRECTION"},
            user,
            at,
        )
        case.work_status, case.action_owner = DataQsWorkStatus.MONITORING, DataQsActionOwner.AGENCY
        case.review_level, case.outcome, case.closed_at = level, None, None
        return {"cycle_id": cycle.id, "level": level.value, "mode": reopening.mode}

    # --- Appeal -----------------------------------------------------------------------------------

    def propose_review(self, user: User, case_id: int, body: DataQsReviewRequestIn) -> DataQsCase:
        case = self._staff_case(user, case_id, body.expected_version)
        cycles = self.repository.review_cycles(case.id)
        if proposed_cycle(cycles) is not None:
            raise DataQsInvalidTransitionError("An appeal is already being prepared")
        filed = submitted_cycles(cycles)
        latest = filed[-1] if filed else None
        if latest is None or latest.decision_issued_at is None:
            raise DataQsInvalidTransitionError("There is no decision to appeal yet")
        if latest.outcome not in (DataQsOutcome.NO_CORRECTION, DataQsOutcome.PARTIAL_CORRECTION):
            raise DataQsInvalidTransitionError("Only a denial on the merits can be appealed")
        if latest.level == DataQsReviewLevel.FINAL:
            raise DataQsInvalidTransitionError(
                "The final review is done; the normal escalation route is closed"
            )
        appeal = self.clocks.active(case, DataQsClockType.APPEAL)
        at = _now()
        if appeal is None or (appeal.due_at is not None and appeal.due_at < at):
            raise DataQsInvalidTransitionError("The 30-day appeal window has ended")
        denied = {
            i.id
            for i in self.repository.issues([case.id])
            if i.outcome == DataQsOutcome.NO_CORRECTION
            and i.id in covered_issue_ids(latest, [i.id])
        }
        chosen = list(dict.fromkeys(body.issue_ids))
        if not chosen or any(i not in denied for i in chosen):
            raise ValidationError("Appeal only issues the last decision denied")

        level = NEXT_LEVEL[latest.level]
        cycle = DataQsReviewCycle(
            case_id=case.id,
            level=level,
            cycle_number=1 + max((c.cycle_number for c in cycles if c.level == level), default=0),
            parent_cycle_id=latest.id,
            opened_reason=f"Appeal of the {LEVEL_LABEL[latest.level]} decision",
            grounds=body.grounds.strip(),
            appealed_issue_ids=chosen,
        )
        self.db.add(cycle)
        before = {"work_status": case.work_status.value}
        self.repository.complete_tasks(case, {"APPEAL_DECISION"}, user, at)
        case.work_status, case.action_owner = DataQsWorkStatus.STAFF_REVIEW, DataQsActionOwner.STS
        self.repository.add_task(
            case,
            "ASSESS_CASE",
            f"Assess the {LEVEL_LABEL[level]} request, then build its package",
            DataQsActionOwner.STS,
            assignee_id=case.owner_id,
        ).due_at = min(at + ASSESS_TARGET, appeal.due_at or at + ASSESS_TARGET)
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "appeal.proposed",
            before=before,
            after={
                "level": level.value,
                "issue_ids": chosen,
                "work_status": case.work_status.value,
            },
        )
        self.db.commit()
        return case

    # --- Close the file and email the carrier -----------------------------------------------------

    def close_file(self, user: User, case_id: int, body: DataQsCloseIn) -> DataQsCase:
        """STS closes the file. A case closed before any decision counts as withdrawn. Open tasks,
        deadlines and reminders end; the carrier is emailed the closing note."""
        case = self._staff_case(user, case_id, body.expected_version)
        if case.work_status in (DataQsWorkStatus.DRAFT, DataQsWorkStatus.CLOSED):
            raise DataQsInvalidTransitionError("This case can't be closed")
        waiting = unverified(self.repository.issues([case.id]))
        reason = (body.unverified_reason or "").strip()
        if waiting and len(reason) < 5:
            raise ValidationError(
                "FMCSA's data doesn't show every approved correction yet. Say why the file is "
                "closing anyway."
            )
        at = _now()
        before = {"work_status": case.work_status.value}
        if case.outcome is None:
            case.outcome = DataQsOutcome.WITHDRAWN
        case.work_status, case.action_owner, case.closed_at = DataQsWorkStatus.CLOSED, None, at
        for task in self.repository.open_tasks([case.id]):
            task.completed_at, task.completed_by_id = at, user.id
        for clock in self.clocks.clocks([case.id]):
            clock.is_active = False
        self.db.flush()
        self.notifications.cancel_pending(case)
        outcome = {
            DataQsOutcome.FULL_CORRECTION: "The agency corrected the record.",
            DataQsOutcome.PARTIAL_CORRECTION: "The agency corrected part of the record.",
            DataQsOutcome.NO_CORRECTION: "The agency did not change the record.",
            DataQsOutcome.PROCEDURAL_CLOSURE: "The agency closed the request without a decision.",
            DataQsOutcome.WITHDRAWN: "The request was closed before a decision.",
        }[case.outcome]
        self.notifications.to_carrier(
            case,
            "FILE_CLOSED",
            f"Your DataQs file #{case.id} is closed",
            f"STS has closed your DataQs file for inspection {case.source_event_id}"
            + (f" (DataQs request {case.gov_request_id})" if case.gov_request_id else "")
            + f".\n\n{outcome}\n\n{body.note.strip()}",
            author=user,
        )
        self.repository.audit(
            case,
            user,
            "case.closed",
            before=before,
            after={
                "work_status": case.work_status.value,
                "outcome": case.outcome.value,
                **(
                    {"unverified_issue_ids": [i.id for i in waiting], "unverified_reason": reason}
                    if waiting
                    else {}
                ),
            },
        )
        self.db.commit()
        return case

    def send_message(self, user: User, case_id: int, body: DataQsMessageIn) -> DataQsCase:
        """STS emails the carrier about the case (e.g. what else is needed)."""
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff email carriers from a case")
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.DRAFT:
            raise DataQsInvalidTransitionError("The carrier hasn't submitted this case yet")
        message = self.notifications.to_carrier(
            case, "MESSAGE", body.subject.strip(), body.body.strip(), author=user
        )
        if not message.recipients:
            raise ValidationError("The carrier's company has no active users to email")
        self.repository.audit(
            case, user, "message.sent", after={"message_id": message.id, "subject": message.subject}
        )
        self.db.commit()
        return case

    # --- Deadline override ------------------------------------------------------------------------

    def override_clock(
        self, user: User, case_id: int, clock_id: int, body: DataQsClockOverrideIn
    ) -> DataQsCase:
        if user.role != UserRole.STS_ADMIN:
            raise DataQsMissingAuthorityError("Only an STS admin can change a deadline")
        case = self._staff_case(user, case_id, body.expected_version)
        clock = next((c for c in self.clocks.clocks([case.id]) if c.id == clock_id), None)
        if clock is None:
            raise DataQsInvalidTransitionError("That deadline isn't active on this case")
        before = {"due_at": clock.due_at.isoformat() if clock.due_at else None}
        self.clocks.override(user, clock_id, body.due_at, body.reason.strip())
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "deadline.overridden",
            before=before,
            after={"clock_id": clock_id, "due_at": body.due_at.isoformat(), "reason": body.reason},
        )
        self.db.commit()
        return case
