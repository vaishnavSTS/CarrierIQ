"""DataQs deadlines (docs/DataQ.md, Phase 5).

Government periods [S2][S3], in calendar days:
- Agency review: 21 days initial, 21 days reconsideration, 45 days final, from the confirmed
  request for that stage. A requester-information request pauses it; the answer resumes the
  remaining time. A reopened stage starts a new cycle with the full budget.
- Requester information: 14 days from the agency's request.
- Appeal: 30 days from the prior decision's issue date (never from when STS recorded it).

Rules this module follows:
- Base times are never edited. Each clock records its rule version, base event, budget, authority
  source and confidence; an override (STS admin only) records who and why.
- Used time = time since the stage started, less the union of confirmed pauses: overlapping pauses
  are merged so no time is subtracted twice. While a pause is open, the agency clock has no due
  date; it shows the days remaining instead.
- These are the requester's deadlines and the agency's expected timing. A late agency does not
  decide the case; a missed requester deadline can.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import DataQsInvalidTransitionError, NotFoundError
from app.models import DataQsCase, DataQsClock, DataQsClockPause, DataQsReviewCycle, User
from app.models.enums import Confidence, DataQsClockType, DataQsReviewLevel
from app.services.dataqs_notifications import DataQsNotifications

POLICY_VERSION = "2026-10-21"
AGENCY_BUDGET_DAYS = {
    DataQsReviewLevel.INITIAL: 21,
    DataQsReviewLevel.RECONSIDERATION: 21,
    DataQsReviewLevel.FINAL: 45,
}
REQUESTER_INFO_DAYS = 14
APPEAL_DAYS = 30
SOURCES = {
    DataQsClockType.AGENCY_REVIEW: "[S3] DataQs Help Center; [S2] 2026 DataQs requirements",
    DataQsClockType.REQUESTER_INFO: "[S3] DataQs Help Center: answer within 14 days",
    DataQsClockType.APPEAL: "[S3] DataQs Help Center: appeal within 30 days of the decision",
}
LABELS = {
    DataQsClockType.FILING_WINDOW: "Filing window",
    DataQsClockType.AGENCY_REVIEW: "Agency decision expected",
    DataQsClockType.REQUESTER_INFO: "Answer the agency by",
    DataQsClockType.APPEAL: "Appeal by",
    DataQsClockType.INTERNAL: "STS target",
}


def _now() -> datetime:
    return datetime.now(UTC)


# --- Pure arithmetic ------------------------------------------------------------------------------

Interval = tuple[datetime, datetime | None]  # (paused_at, resumed_at); None: still paused


def merged(pauses: Iterable[Interval], until: datetime) -> list[tuple[datetime, datetime]]:
    """Pause intervals clipped at `until` and merged where they overlap."""
    spans = sorted((start, min(end or until, until)) for start, end in pauses if start < until)
    result: list[tuple[datetime, datetime]] = []
    for start, end in spans:
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def paused_for(pauses: Iterable[Interval], since: datetime, until: datetime) -> timedelta:
    total = timedelta()
    for start, end in merged(pauses, until):
        start = max(start, since)
        if end > start:
            total += end - start
    return total


def used(base: datetime, pauses: Iterable[Interval], now: datetime) -> timedelta:
    """Review time used since the stage started, not counting confirmed pauses."""
    return max(timedelta(), (now - base) - paused_for(list(pauses), base, now))


def due(base: datetime, budget_days: int, pauses: Iterable[Interval]) -> datetime | None:
    """The due date once every pause has ended; None while one is still open."""
    pauses = list(pauses)
    if any(end is None for _, end in pauses):
        return None
    far = datetime.max.replace(tzinfo=UTC)
    return base + timedelta(days=budget_days) + paused_for(pauses, base, far)


@dataclass(frozen=True)
class ClockState:
    paused: bool
    due_at: datetime | None
    remaining: timedelta  # budget left (negative once past due)


def state(clock: DataQsClock, pauses: list[Interval], now: datetime) -> ClockState:
    paused = any(end is None for _, end in pauses)
    budget = timedelta(days=clock.budget_days or 0)
    if clock.due_at is not None and clock.override_reason:
        return ClockState(paused, clock.due_at, clock.due_at - now)  # an override wins
    return ClockState(
        paused,
        due(clock.base_at, clock.budget_days or 0, pauses),
        budget - used(clock.base_at, pauses, now),
    )


# --- Database -------------------------------------------------------------------------------------


class DataQsClockService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def pauses(self, clock_ids: Iterable[int]) -> dict[int, list[Interval]]:
        ids = list(clock_ids)
        result: dict[int, list[Interval]] = {i: [] for i in ids}
        if not ids:
            return result
        for p in self.db.scalars(
            select(DataQsClockPause)
            .where(DataQsClockPause.clock_id.in_(ids))
            .order_by(DataQsClockPause.paused_at)
        ):
            result[p.clock_id].append((p.paused_at, p.resumed_at))
        return result

    def clocks(self, case_ids: Iterable[int], active_only: bool = True) -> list[DataQsClock]:
        ids = list(case_ids)
        if not ids:
            return []
        query = select(DataQsClock).where(DataQsClock.case_id.in_(ids))
        if active_only:
            query = query.where(DataQsClock.is_active.is_(True))
        return list(self.db.scalars(query.order_by(DataQsClock.id)))

    def _add(
        self,
        case: DataQsCase,
        clock_type: DataQsClockType,
        base_event: str,
        base_at: datetime,
        budget_days: int,
        cycle: DataQsReviewCycle | None = None,
    ) -> DataQsClock:
        clock = DataQsClock(
            case_id=case.id,
            cycle_id=cycle.id if cycle else None,
            clock_type=clock_type,
            base_event=base_event,
            base_at=base_at,
            timezone="UTC",
            policy_version=POLICY_VERSION,
            authority_source=SOURCES.get(clock_type),
            budget_days=budget_days,
            due_at=base_at + timedelta(days=budget_days),
            confidence=Confidence.HIGH,
        )
        self.db.add(clock)
        self.db.flush()
        return clock

    def start_agency(
        self, case: DataQsCase, cycle: DataQsReviewCycle, base_at: datetime
    ) -> DataQsClock:
        """A confirmed request for a stage starts that stage's full review budget."""
        self.stop(case, {DataQsClockType.AGENCY_REVIEW})
        return self._add(
            case,
            DataQsClockType.AGENCY_REVIEW,
            f"{cycle.level.value.lower()}_request_confirmed",
            base_at,
            AGENCY_BUDGET_DAYS[cycle.level],
            cycle,
        )

    def start_requester_info(self, case: DataQsCase, issued_at: datetime) -> DataQsClock:
        clock = self._add(
            case,
            DataQsClockType.REQUESTER_INFO,
            "info_request_issued",
            issued_at,
            REQUESTER_INFO_DAYS,
        )
        DataQsNotifications(self.db).schedule_deadline_reminders(case, clock)
        return clock

    def start_appeal(
        self, case: DataQsCase, cycle: DataQsReviewCycle, issued_at: datetime
    ) -> DataQsClock:
        self.stop(case, {DataQsClockType.APPEAL})
        clock = self._add(
            case, DataQsClockType.APPEAL, "decision_issued", issued_at, APPEAL_DAYS, cycle
        )
        DataQsNotifications(self.db).schedule_deadline_reminders(case, clock)
        return clock

    def active(self, case: DataQsCase, clock_type: DataQsClockType) -> DataQsClock | None:
        return next((c for c in self.clocks([case.id]) if c.clock_type == clock_type), None)

    def pause_agency(self, case: DataQsCase, at: datetime, correspondence_id: int) -> None:
        clock = self.active(case, DataQsClockType.AGENCY_REVIEW)
        if clock is None:
            return
        self.db.add(
            DataQsClockPause(
                clock_id=clock.id, paused_at=at, start_correspondence_id=correspondence_id
            )
        )
        self.db.flush()
        self._refresh_due(clock)

    def resume_agency(self, case: DataQsCase, at: datetime, correspondence_id: int) -> None:
        clock = self.active(case, DataQsClockType.AGENCY_REVIEW)
        if clock is None:
            return
        for pause in self.db.scalars(
            select(DataQsClockPause).where(
                DataQsClockPause.clock_id == clock.id, DataQsClockPause.resumed_at.is_(None)
            )
        ):
            pause.resumed_at = max(at, pause.paused_at)
            pause.end_correspondence_id = correspondence_id
        self.db.flush()
        self._refresh_due(clock)

    def _refresh_due(self, clock: DataQsClock) -> None:
        if clock.override_reason:
            return
        clock.due_at = due(clock.base_at, clock.budget_days or 0, self.pauses([clock.id])[clock.id])

    def stop(self, case: DataQsCase, types: set[DataQsClockType]) -> None:
        for clock in self.clocks([case.id]):
            if clock.clock_type in types:
                clock.is_active = False

    def override(self, user: User, clock_id: int, due_at: datetime, reason: str) -> DataQsClock:
        """An STS admin sets a due date by hand (e.g. a state's own counting rule)."""
        clock = self.db.get(DataQsClock, clock_id)
        if clock is None:
            raise NotFoundError(f"Clock {clock_id} not found")
        if not clock.is_active:
            raise DataQsInvalidTransitionError("This deadline is no longer active")
        clock.due_at, clock.override_reason, clock.overridden_by_id = due_at, reason, user.id
        clock.confidence = Confidence.MEDIUM
        self.db.flush()
        return clock
