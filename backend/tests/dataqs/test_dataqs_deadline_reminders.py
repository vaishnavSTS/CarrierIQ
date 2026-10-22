"""Reminders to STS before its own deadlines (Phase 6): 7, 3 and 1 days before an answer to an
agency information request is due, and 14, 7, 3 and 1 days before the last day to appeal."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsCase, DataQsClock, DataQsOutbox, User
from app.models.enums import DataQsClockType, DataQsOutboxStatus
from app.services.dataqs_clock_service import APPEAL_DAYS, DataQsClockService
from app.services.dataqs_notifications import DataQsNotifications
from tests.dataqs.helpers import submitted_case


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str):
        self.sent.append({"to": to, "subject": subject, "text": text, "key": idempotency_key})
        return "email-id"


def _case(api: TestClient, db: Session) -> DataQsCase:
    case = db.get(DataQsCase, submitted_case(api)["id"])
    assert case is not None
    return case


def _reminders(db: Session, case_id: int) -> dict[str, DataQsOutbox]:
    rows = db.scalars(
        select(DataQsOutbox).where(
            DataQsOutbox.case_id == case_id, DataQsOutbox.kind.like("REMINDER_%_LEFT")
        )
    )
    return {r.kind: r for r in rows}


def _answer_clock(db: Session, case: DataQsCase) -> DataQsClock:
    clock = DataQsClockService(db).start_requester_info(
        case, datetime.now(UTC) - timedelta(hours=1)
    )
    db.commit()
    assert clock.due_at is not None
    return clock


def test_an_information_request_schedules_reminders_before_the_answer_is_due(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _case(api, db)
    clock = _answer_clock(db, case)
    rows = _reminders(db, case.id)
    assert set(rows) == {f"REMINDER_ANSWER_{d}_DAYS_LEFT" for d in (7, 3, 1)}
    for days in (7, 3, 1):
        assert rows[f"REMINDER_ANSWER_{days}_DAYS_LEFT"].next_attempt_at == clock.due_at - (
            timedelta(days=days)
        )

    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender, now=clock.due_at - timedelta(days=7, minutes=-1))
    [email] = sender.sent
    assert email["to"] == ["admin@sts.test"]  # nobody owns the case: STS admins
    assert email["subject"].startswith("Answer the agency by ")
    assert "Add Response / Documents" in email["text"] and "in 7 days" in email["text"]
    assert rows["REMINDER_ANSWER_7_DAYS_LEFT"].status == DataQsOutboxStatus.SENT


def test_after_downtime_only_the_most_urgent_reminder_goes(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _case(api, db)
    clock = _answer_clock(db, case)
    sender = FakeSender()
    # The server was asleep through the 7-day and 3-day reminders.
    DataQsNotifications(db).deliver_due(sender, now=clock.due_at - timedelta(days=2))
    rows = _reminders(db, case.id)
    assert len(sender.sent) == 1  # the 3-day one only
    assert rows["REMINDER_ANSWER_7_DAYS_LEFT"].status == DataQsOutboxStatus.CANCELLED
    assert rows["REMINDER_ANSWER_3_DAYS_LEFT"].status == DataQsOutboxStatus.SENT
    assert rows["REMINDER_ANSWER_1_DAYS_LEFT"].status == DataQsOutboxStatus.PENDING


def test_a_met_deadline_drops_its_reminders(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _case(api, db)
    clock = _answer_clock(db, case)
    clock.is_active = False  # the answer was recorded
    db.commit()
    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender, now=clock.due_at - timedelta(hours=1))
    assert sender.sent == []
    assert {r.status for r in _reminders(db, case.id).values()} == {DataQsOutboxStatus.CANCELLED}


def test_a_moved_deadline_moves_its_reminders(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _case(api, db)
    clock = _answer_clock(db, case)
    first_due = clock.due_at
    assert first_due is not None
    later = first_due + timedelta(days=5)
    DataQsClockService(db).override(world["staff2"], clock.id, later, "Agency granted more time")
    db.commit()

    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender, now=first_due - timedelta(days=7, minutes=-1))
    assert sender.sent == []
    row = _reminders(db, case.id)["REMINDER_ANSWER_7_DAYS_LEFT"]
    assert row.status == DataQsOutboxStatus.PENDING
    assert row.next_attempt_at == later - timedelta(days=7)

    # While a deadline is paused (no due date), the reminder waits a day and looks again.
    clock.due_at, clock.override_reason = None, None
    db.commit()
    now = later - timedelta(days=7, minutes=-1)
    DataQsNotifications(db).deliver_due(sender, now=now)
    assert sender.sent == [] and row.next_attempt_at == now + timedelta(days=1)


def test_an_appeal_recorded_late_skips_reminders_already_past(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _case(api, db)
    clocks = DataQsClockService(db)
    # The decision was issued 20 days ago: 10 days are left to appeal.
    issued = datetime.now(UTC) - timedelta(days=20)
    clock = clocks._add(case, DataQsClockType.APPEAL, "decision_issued", issued, APPEAL_DAYS)
    DataQsNotifications(db).schedule_deadline_reminders(case, clock)
    db.commit()
    assert set(_reminders(db, case.id)) == {f"REMINDER_APPEAL_{d}_DAYS_LEFT" for d in (7, 3, 1)}

    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender, now=issued + timedelta(days=APPEAL_DAYS - 1))
    [email] = sender.sent
    assert email["subject"].startswith("Appeal deadline ")
    assert "Re-open Request" in email["text"]
