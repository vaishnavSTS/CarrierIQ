"""The DataQs supervisor view (docs/DataQ.md, Phase 6): what needs an STS admin's attention across
every case, each specialist's workload, and the audit trail as a CSV.

Exceptions, most serious first:
- an answer to the agency or an appeal that is overdue or due within DUE_SOON_DAYS;
- the filing window passed, or closing (DATAQS_INTERNAL_CUTOFF_DAYS), on a request not yet filed;
- a filing attempt with no confirmation yet;
- an agency decision later than its expected date (STS should follow up);
- open cases nobody owns, overdue tasks, emails that failed or are being retried;
- deadlines whose date is uncertain, and cases with no activity for STALE_DAYS.

Everything is read-only and computed when asked; nothing here changes a case.
"""

import csv
import io
import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import DataQsAuditEvent, DataQsCase, DataQsClock, DataQsOutbox, User
from app.models.enums import (
    Confidence,
    DataQsActionOwner,
    DataQsClockType,
    DataQsOutboxStatus,
    DataQsWorkStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsExceptionOut,
    DataQsSupervisorOut,
    DataQsWorkloadOut,
)
from app.services import dataqs_eligibility
from app.services.dataqs_clock_service import DataQsClockService

DUE_SOON_DAYS = 3
STALE_DAYS = 14
EMAIL_LOOKBACK_DAYS = 30
SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
NOT_FILED = {
    DataQsWorkStatus.DRAFT,
    DataQsWorkStatus.EVIDENCE_NEEDED,
    DataQsWorkStatus.STAFF_REVIEW,
    DataQsWorkStatus.AWAITING_APPROVAL,
    DataQsWorkStatus.READY_TO_FILE,
}
# The same wording as the case's email log.
EMAIL_KINDS = {
    "MESSAGE": "Message to the carrier",
    "EVIDENCE_NEEDED": "Evidence needed (carrier)",
    "PACKAGE_READY": "Package ready to approve (carrier)",
    "FILED": "Filed with DataQs (carrier)",
    "DECISION": "Agency decision (carrier)",
    "FILE_CLOSED": "File closed (carrier)",
    "REMINDER_7_DAYS": "Reminder: 7 days since filing (STS)",
    "REMINDER_21_DAYS": "Reminder: 21 days since filing (STS)",
}
# Deadlines STS must meet (the agency's own review date is a follow-up, not STS's deadline).
STS_DEADLINES = {
    DataQsClockType.REQUESTER_INFO: "Answer to the agency",
    DataQsClockType.APPEAL: "Appeal",
    DataQsClockType.INTERNAL: "STS target",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _days(delta: timedelta) -> int:
    return abs(delta.days) if delta.days < 0 else delta.days


class _Found:
    """The exceptions found so far, with the names they show."""

    def __init__(self, org_names: dict[int, str], owners: dict[int, str]) -> None:
        self.org_names, self.owners = org_names, owners
        self.items: list[DataQsExceptionOut] = []

    def add(
        self,
        case: DataQsCase,
        kind: str,
        severity: str,
        title: str,
        detail: str,
        at: datetime | None = None,
    ) -> None:
        self.items.append(
            DataQsExceptionOut(
                kind=kind,
                severity=severity,
                case_id=case.id,
                organization_name=self.org_names.get(case.organization_id),
                usdot_number=case.usdot_number,
                owner_name=self.owners.get(case.owner_id) if case.owner_id else None,
                work_status=case.work_status,
                title=title,
                detail=detail,
                at=at,
            )
        )


@dataclass
class _Load:
    active: int = 0
    needs_sts: int = 0
    waiting_carrier: int = 0
    waiting_agency: int = 0
    overdue_tasks: int = 0
    overdue_deadlines: int = 0


class DataQsSupervisorService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)

    # --- The view ---------------------------------------------------------------------------------

    def overview(self, now: datetime | None = None) -> DataQsSupervisorOut:
        now = now or _now()
        cases = self.repository.list_cases()
        active = [c for c in cases if c.work_status != DataQsWorkStatus.CLOSED]
        by_id = {c.id: c for c in cases}
        org_names = self.repository.organization_names([c.organization_id for c in cases])
        owners = self.repository.user_names([c.owner_id for c in cases if c.owner_id])
        found = _Found(org_names, owners)
        loads: dict[int | None, _Load] = defaultdict(_Load)
        for case in active:
            if case.work_status == DataQsWorkStatus.DRAFT:
                continue  # the carrier has not sent it to STS yet
            load = loads[case.owner_id]
            load.active += 1
            if case.action_owner == DataQsActionOwner.STS:
                load.needs_sts += 1
            elif case.action_owner == DataQsActionOwner.CARRIER:
                load.waiting_carrier += 1
            elif case.action_owner == DataQsActionOwner.AGENCY:
                load.waiting_agency += 1
            if case.owner_id is None:
                found.add(
                    case,
                    "UNASSIGNED",
                    "MEDIUM",
                    "No STS owner",
                    "Assign a case specialist in the case's Owner panel.",
                    case.created_at,
                )
            if case.work_status == DataQsWorkStatus.SUBMISSION_UNCONFIRMED:
                found.add(
                    case,
                    "SUBMISSION_UNCONFIRMED",
                    "HIGH",
                    "Filing not confirmed",
                    "A filing was started but its DataQs request ID was never recorded. Check "
                    "DataQs, then confirm or abandon the attempt before filing again.",
                    case.updated_at,
                )

        self._deadlines(active, by_id, now, found, loads)
        self._filing_windows(active, now, found)
        self._tasks(active, by_id, now, found, loads)
        self._emails(by_id, now, found)
        self._stale(active, by_id, now, found)

        exceptions = found.items
        exceptions.sort(
            key=lambda e: (
                SEVERITY_ORDER[e.severity],
                e.at or datetime.max.replace(tzinfo=UTC),
                e.case_id,
            )
        )
        staff = {u.id: u.full_name for u in self.repository.staff_users()}
        workload = [
            DataQsWorkloadOut(
                owner_id=owner_id,
                owner_name=(
                    None if owner_id is None else staff.get(owner_id) or owners.get(owner_id)
                ),
                active_cases=load.active,
                needs_sts=load.needs_sts,
                waiting_carrier=load.waiting_carrier,
                waiting_agency=load.waiting_agency,
                overdue_tasks=load.overdue_tasks,
                overdue_deadlines=load.overdue_deadlines,
            )
            for owner_id, load in loads.items()
        ]
        # Staff with nothing assigned still appear, so the load can be shared out.
        workload += [
            DataQsWorkloadOut(owner_id=uid, owner_name=name)
            for uid, name in staff.items()
            if uid not in loads
        ]
        workload.sort(key=lambda w: (w.owner_id is not None, -w.active_cases, w.owner_name or ""))
        return DataQsSupervisorOut(
            generated_at=now,
            stale_days=STALE_DAYS,
            exceptions=exceptions,
            workload=workload,
        )

    def _deadlines(
        self,
        active: list[DataQsCase],
        by_id: dict[int, DataQsCase],
        now: datetime,
        found: _Found,
        loads: dict[int | None, _Load],
    ) -> None:
        clocks: list[DataQsClock] = DataQsClockService(self.db).clocks([c.id for c in active])
        for clock in clocks:
            case = by_id[clock.case_id]
            if clock.confidence == Confidence.LOW:
                found.add(
                    case,
                    "UNCERTAIN_DATE",
                    "LOW",
                    "Deadline date uncertain",
                    f"{clock.clock_type.value.replace('_', ' ').title()}: check the date it "
                    "counts from and correct it if needed.",
                    clock.due_at,
                )
            if clock.due_at is None:
                continue  # paused: the agency is waiting on someone
            left = clock.due_at - now
            if clock.clock_type == DataQsClockType.AGENCY_REVIEW:
                if left < timedelta():
                    found.add(
                        case,
                        "AGENCY_LATE",
                        "MEDIUM",
                        "Agency decision is late",
                        f"Expected {_days(left)} day(s) ago. Check the request in DataQs and "
                        "follow up with the agency.",
                        clock.due_at,
                    )
                continue
            name = STS_DEADLINES.get(clock.clock_type)
            if name is None:
                continue  # the filing window is checked from the event date
            if left < timedelta():
                loads[case.owner_id].overdue_deadlines += 1
                found.add(
                    case,
                    "DEADLINE_OVERDUE",
                    "HIGH",
                    f"{name} overdue",
                    f"Was due {_days(left)} day(s) ago.",
                    clock.due_at,
                )
            elif left <= timedelta(days=DUE_SOON_DAYS):
                found.add(
                    case,
                    "DEADLINE_SOON",
                    "MEDIUM",
                    f"{name} due soon",
                    f"Due in {max(left.days, 0)} day(s).",
                    clock.due_at,
                )

    def _filing_windows(self, active: Iterable[DataQsCase], now: datetime, found: _Found) -> None:
        cutoff = get_settings().dataqs_internal_cutoff_days
        for case in active:
            if case.work_status not in NOT_FILED:
                continue
            if case.event_date is None:
                if case.work_status != DataQsWorkStatus.DRAFT:
                    found.add(
                        case,
                        "UNCERTAIN_DATE",
                        "LOW",
                        "Inspection date unknown",
                        "The filing window can't be checked until the inspection date is known.",
                    )
                continue
            ends = dataqs_eligibility.anniversary(
                case.event_date, dataqs_eligibility.WINDOW_YEARS[case.event_type]
            )
            days_left = (ends - now.date()).days
            when = datetime(ends.year, ends.month, ends.day, tzinfo=UTC)
            if days_left < 0:
                found.add(
                    case,
                    "WINDOW_PASSED",
                    "HIGH",
                    "Filing window passed",
                    f"It ended {-days_left} day(s) ago and the request was never filed.",
                    when,
                )
            elif days_left <= cutoff:
                found.add(
                    case,
                    "WINDOW_CLOSING",
                    "HIGH" if days_left <= 7 else "MEDIUM",
                    "Filing window closing",
                    f"{days_left} day(s) left to file in DataQs.",
                    when,
                )

    def _tasks(
        self,
        active: list[DataQsCase],
        by_id: dict[int, DataQsCase],
        now: datetime,
        found: _Found,
        loads: dict[int | None, _Load],
    ) -> None:
        for task in self.repository.open_tasks([c.id for c in active]):
            if task.due_at is None or task.due_at >= now:
                continue
            case = by_id[task.case_id]
            if case.work_status == DataQsWorkStatus.DRAFT:
                continue
            loads[case.owner_id].overdue_tasks += 1
            found.add(
                case,
                "TASK_OVERDUE",
                "MEDIUM",
                f"Overdue: {task.title}",
                f"Waiting on {task.action_owner.value.lower()}; due "
                f"{_days(task.due_at - now)} day(s) ago.",
                task.due_at,
            )

    def _emails(self, by_id: dict[int, DataQsCase], now: datetime, found: _Found) -> None:
        since = now - timedelta(days=EMAIL_LOOKBACK_DAYS)
        rows = self.db.scalars(
            select(DataQsOutbox).where(
                DataQsOutbox.updated_at >= since,
                (DataQsOutbox.status == DataQsOutboxStatus.FAILED)
                | (
                    (DataQsOutbox.status == DataQsOutboxStatus.PENDING)
                    & (DataQsOutbox.attempts > 0)
                ),
            )
        )
        for row in rows:
            case = by_id.get(row.case_id)
            if case is None:
                continue
            failed = row.status == DataQsOutboxStatus.FAILED
            found.add(
                case,
                "EMAIL_FAILED" if failed else "EMAIL_RETRYING",
                "MEDIUM" if failed else "LOW",
                ("Email not sent: " if failed else "Email being retried: ")
                + EMAIL_KINDS.get(row.kind, row.kind.replace("_", " ").capitalize()),
                (row.last_error or "No error recorded")[:300].rstrip(".")
                + (
                    ". The carrier has not been told; contact them another way."
                    if failed
                    else f" ({row.attempts} tries so far)."
                ),
                row.updated_at,
            )

    def _stale(
        self,
        active: list[DataQsCase],
        by_id: dict[int, DataQsCase],
        now: datetime,
        found: _Found,
    ) -> None:
        ids = [
            c.id
            for c in active
            if c.work_status != DataQsWorkStatus.DRAFT
            and c.action_owner != DataQsActionOwner.AGENCY  # covered by the agency's own date
        ]
        if not ids:
            return
        last = dict(
            self.db.execute(
                select(DataQsAuditEvent.case_id, func.max(DataQsAuditEvent.created_at))
                .where(DataQsAuditEvent.case_id.in_(ids))
                .group_by(DataQsAuditEvent.case_id)
            ).all()
        )
        for case_id in ids:
            case = by_id[case_id]
            seen = max(filter(None, [last.get(case_id), case.updated_at, case.created_at]))
            quiet = now - seen
            if quiet >= timedelta(days=STALE_DAYS):
                waiting = "the carrier" if case.action_owner == DataQsActionOwner.CARRIER else "STS"
                found.add(
                    case,
                    "STALE",
                    "LOW",
                    "No activity",
                    f"Nothing has happened for {quiet.days} days; waiting on {waiting}.",
                    seen,
                )

    # --- Audit export -----------------------------------------------------------------------------

    def audit_csv(self, since: datetime, until: datetime) -> str:
        """Every audit event in [since, until), oldest first."""
        events = list(
            self.db.scalars(
                select(DataQsAuditEvent)
                .where(DataQsAuditEvent.created_at >= since, DataQsAuditEvent.created_at < until)
                .order_by(DataQsAuditEvent.created_at, DataQsAuditEvent.id)
            )
        )
        case_ids = {e.case_id for e in events}
        cases = {
            c.id: c for c in self.db.scalars(select(DataQsCase).where(DataQsCase.id.in_(case_ids)))
        }
        org_names = self.repository.organization_names([c.organization_id for c in cases.values()])
        actor_ids = {e.actor_id for e in events if e.actor_id}
        actors = {
            u.id: u.email for u in self.db.scalars(select(User).where(User.id.in_(actor_ids)))
        }
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(
            [
                "time_utc",
                "case_id",
                "company",
                "usdot",
                "actor",
                "action",
                "case_version",
                "before",
                "after",
            ]
        )
        for e in events:
            case = cases.get(e.case_id)
            writer.writerow(
                _safe(v)
                for v in [
                    e.created_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S"),
                    e.case_id,
                    org_names.get(case.organization_id, "") if case else "",
                    case.usdot_number if case else "",
                    actors.get(e.actor_id, "") if e.actor_id else "system",
                    e.action,
                    e.case_row_version if e.case_row_version is not None else "",
                    json.dumps(e.before, default=str, sort_keys=True) if e.before else "",
                    json.dumps(e.after, default=str, sort_keys=True) if e.after else "",
                ]
            )
        return out.getvalue()


def _safe(value: object) -> str:
    """Spreadsheets run a cell that starts with = + - @ as a formula; make it plain text."""
    text = str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text
