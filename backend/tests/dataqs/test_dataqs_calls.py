"""Calls with the STS specialist: the carrier books a time on the case; they get an email with the
calendar file and an "Add to Google Calendar" button, a text now and a text 1 hour before; STS is
told and gets a task. Moving or cancelling the call updates all of it."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import DataQsOutbox, User
from app.models.enums import DataQsOutboxStatus
from app.services.dataqs_email import Attachment
from app.services.dataqs_notifications import DataQsNotifications
from tests.dataqs.helpers import log_in, staff_case, submitted_case

CHICAGO = "America/Chicago"


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(
        self,
        *,
        to: list[str],
        subject: str,
        text: str,
        html: str,
        idempotency_key: str,
        attachments: tuple[Attachment, ...] | list[Attachment] = (),
    ) -> str:
        self.sent.append({"to": to, "subject": subject, "html": html, "files": list(attachments)})
        return "email-id"


class FakeSms:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send_sms(self, to: str, body: str) -> str:
        self.sent.append((to, body))
        return f"SM{len(self.sent)}"


def in_days(days: int, hour: int = 14, minute: int = 30) -> datetime:
    local = datetime.now(ZoneInfo(CHICAGO)) + timedelta(days=days)
    return local.replace(hour=hour, minute=minute, second=0, microsecond=0)


def book(
    api: TestClient,
    case_id: int,
    starts_at: datetime,
    *,
    base: str = "/api/v1/portal/dataqs",
    **extra,
) -> httpx.Response:
    return api.post(
        f"{base}/cases/{case_id}/calls",
        json={
            "starts_at": starts_at.isoformat(),
            "time_zone": CHICAGO,
            "phone": "(555) 010-2030",
            "topic": "What else should I upload?",
            **extra,
        },
    )


def rows(db: Session, case_id: int, kind: str) -> list[DataQsOutbox]:
    return list(
        db.scalars(
            select(DataQsOutbox)
            .where(DataQsOutbox.case_id == case_id, DataQsOutbox.kind == kind)
            .order_by(DataQsOutbox.id)
        )
    )


def owners_case(api: TestClient) -> dict:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    return case


def test_booking_emails_the_calendar_texts_and_tells_sts(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = owners_case(api)
    starts = in_days(2)
    booked = book(api, case["id"], starts)
    assert booked.status_code == 200, booked.text
    [call] = booked.json()["calls"]
    assert (call["status"], call["phone"], call["duration_minutes"]) == (
        "BOOKED",
        "+15550102030",
        30,
    )
    assert booked.json()["can_book_call"] is True
    assert call["google_calendar_url"].startswith("https://calendar.google.com/calendar/render?")
    assert "action=TEMPLATE" in call["google_calendar_url"]

    # The email goes to whoever booked (not every user), with the calendar file and the button.
    [email] = rows(db, case["id"], "CALL_BOOKED")
    assert email.payload["to"] == ["owner@acme.test"]
    assert email.payload["subject"].startswith("Your call with STS is booked:")
    assert "Add to Google Calendar" in email.payload["html"]
    ics = email.payload["ics"]
    assert ics.startswith("BEGIN:VCALENDAR\r\n") and "METHOD:PUBLISH" in ics
    assert "TRIGGER:-PT30M" in ics and f"UID:dataqs-call-{call['id']}@" in ics
    assert f"DTSTART:{starts.astimezone(UTC):%Y%m%dT%H%M%SZ}" in ics
    assert "ATTENDEE" not in ics and "ORGANIZER" not in ics  # not an invitation

    # A text now, and one an hour before the call.
    [now_text] = rows(db, case["id"], "CALL_TEXT")
    assert now_text.channel == "SMS" and now_text.next_attempt_at is None
    assert now_text.payload["to"] == ["+15550102030"] and "booked for" in now_text.payload["body"]
    [reminder] = rows(db, case["id"], "CALL_REMINDER_TEXT")
    assert reminder.next_attempt_at == starts.astimezone(UTC) - timedelta(hours=1)
    assert "in 1 hour" in reminder.payload["body"]

    # STS: an email with the same calendar file, and a task due at the call.
    [notice] = rows(db, case["id"], "NOTICE_CALL_BOOKED")
    assert (
        "booked a call" in notice.payload["subject"] and "BEGIN:VCALENDAR" in notice.payload["ics"]
    )
    log_in(api, "analyst@sts.test")
    tasks = [t for t in staff_case(api, case["id"])["tasks"] if t["kind"] == "CALL_CARRIER"]
    assert len(tasks) == 1 and tasks[0]["due_at"] is not None
    assert "(555) 010-2030" in tasks[0]["detail"]


def test_moving_the_call_replaces_its_reminder_and_calendar_entry(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = owners_case(api)
    first = book(api, case["id"], in_days(2)).json()["calls"][0]
    later = in_days(3, hour=9, minute=0)
    moved = book(api, case["id"], later, phone="555-010-9999", topic=None)
    assert moved.status_code == 200, moved.text
    [call] = moved.json()["calls"]  # the same call, moved
    assert call["id"] == first["id"] and call["phone"] == "+15550109999"

    reminders = rows(db, case["id"], "CALL_REMINDER_TEXT")
    assert [r.status for r in reminders] == [
        DataQsOutboxStatus.CANCELLED,
        DataQsOutboxStatus.PENDING,
    ]
    assert reminders[1].next_attempt_at == later.astimezone(UTC) - timedelta(hours=1)
    [email] = rows(db, case["id"], "CALL_MOVED")
    assert "moved to" in email.payload["subject"] and "SEQUENCE:1" in email.payload["ics"]

    log_in(api, "analyst@sts.test")
    tasks = [t for t in staff_case(api, case["id"])["tasks"] if t["kind"] == "CALL_CARRIER"]
    assert len(tasks) == 1  # the old one is done


def test_cancelling_drops_the_reminder_and_sends_a_cancelled_calendar_entry(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = owners_case(api)
    call = book(api, case["id"], in_days(2)).json()["calls"][0]
    cancelled = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/calls/{call['id']}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["calls"][0]["status"] == "CANCELLED"
    assert [r.status for r in rows(db, case["id"], "CALL_REMINDER_TEXT")] == [
        DataQsOutboxStatus.CANCELLED
    ]
    [email] = rows(db, case["id"], "CALL_CANCELLED")
    assert "METHOD:CANCEL" in email.payload["ics"] and "STATUS:CANCELLED" in email.payload["ics"]
    assert "TRIGGER" not in email.payload["ics"]
    assert rows(db, case["id"], "NOTICE_CALL_CANCELLED")
    again = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/calls/{call['id']}/cancel")
    assert again.status_code == 409

    log_in(api, "analyst@sts.test")
    assert not [t for t in staff_case(api, case["id"])["tasks"] if t["kind"] == "CALL_CARRIER"]


def test_booking_rules(api: TestClient, world: dict[str, User], db: Session) -> None:
    case = owners_case(api)
    soon = datetime.now(UTC) + timedelta(minutes=10)
    assert "30 minutes" in book(api, case["id"], soon).text
    assert "90 days" in book(api, case["id"], in_days(120)).text
    assert book(api, case["id"], in_days(2), phone="12345").status_code == 422
    assert book(api, case["id"], in_days(2), time_zone="Mars/Olympus").status_code == 422
    naive = in_days(2).replace(tzinfo=None)
    assert book(api, case["id"], naive).status_code == 422

    # Booked less than an hour ahead: no reminder text (the confirmation is enough).
    assert book(api, case["id"], datetime.now(UTC) + timedelta(minutes=45)).status_code == 200
    assert rows(db, case["id"], "CALL_REMINDER_TEXT") == []

    log_in(api, "viewer@acme.test")  # viewers can't change the case
    assert book(api, case["id"], in_days(2)).status_code == 403


def test_staff_book_for_the_carrier_and_mark_the_call_held(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = submitted_case(api)
    log_in(api, "analyst@sts.test")
    booked = book(api, case["id"], in_days(2), base="/api/v1/dataqs")
    assert booked.status_code == 200, booked.text
    call = booked.json()["calls"][0]
    # STS booked it: every carrier user is emailed; STS isn't told about its own booking.
    emailed = sorted(e.payload["to"][0] for e in rows(db, case["id"], "CALL_BOOKED"))
    assert emailed == ["owner@acme.test", "viewer@acme.test"]
    assert rows(db, case["id"], "NOTICE_CALL_BOOKED") == []

    done = api.post(f"/api/v1/dataqs/cases/{case['id']}/calls/{call['id']}/done")
    assert done.status_code == 200, done.text
    assert done.json()["calls"][0]["status"] == "DONE"
    assert [r.status for r in rows(db, case["id"], "CALL_REMINDER_TEXT")] == [
        DataQsOutboxStatus.CANCELLED
    ]

    log_in(api, "owner@acme.test")
    ics = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}/calls/{call['id']}/calendar.ics")
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    assert b"BEGIN:VEVENT" in ics.content


def test_the_dispatcher_sends_the_calendar_file_and_the_texts(
    api: TestClient, world: dict[str, User], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = owners_case(api)
    starts = in_days(2)
    book(api, case["id"], starts)
    sender, sms = FakeSender(), FakeSms()
    notifications = DataQsNotifications(db)

    notifications.deliver_due(sender, sms=sms)  # now: the emails and the confirmation text
    [to_owner] = [e for e in sender.sent if e["to"] == ["owner@acme.test"]]
    [file] = to_owner["files"]
    assert file.content_type == "text/calendar" and file.filename.endswith(".ics")
    assert file.data.startswith(b"BEGIN:VCALENDAR")
    assert len(sms.sent) == 1 and sms.sent[0][0] == "+15550102030"

    # An hour before: the reminder.
    notifications.deliver_due(sender, now=starts.astimezone(UTC) - timedelta(minutes=59), sms=sms)
    assert len(sms.sent) == 2 and "in 1 hour" in sms.sent[1][1]


def test_texts_follow_the_test_routing_and_wait_for_twilio(
    api: TestClient, world: dict[str, User], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_sms_override", "+12095550123")
    case = owners_case(api)
    book(api, case["id"], in_days(2))
    [text] = rows(db, case["id"], "CALL_TEXT")
    assert text.payload["to"] == ["+12095550123"]
    assert text.payload["body"].startswith("[Test: meant for +15550102030]")

    DataQsNotifications(db).deliver_due(FakeSender(), sms=None)  # Twilio not set up
    db.refresh(text)
    assert text.status == DataQsOutboxStatus.FAILED and "set up yet" in (text.last_error or "")


def test_supervisor_says_texts_are_not_set_up_yet(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = owners_case(api)
    book(api, case["id"], in_days(2))
    DataQsNotifications(db).deliver_due(FakeSender(), sms=None)  # no Twilio number yet
    db.commit()
    log_in(api, "admin@sts.test")
    found = api.get("/api/v1/dataqs/supervisor").json()["exceptions"]
    [text] = [e for e in found if e["case_id"] == case["id"] and e["kind"] == "TEXT_NOT_SET_UP"]
    assert text["title"].startswith("Text not sent:") and text["severity"] == "LOW"
    assert "Text messages aren't set up yet" in text["detail"]
    assert not [e for e in found if e["case_id"] == case["id"] and e["kind"] == "EMAIL_FAILED"]
