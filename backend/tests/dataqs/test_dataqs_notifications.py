"""DataQs emails: to the carrier at key steps and from STS staff, reminders to staff 7 and 21 days
after filing, and the closing email when STS closes the file. Delivery goes through the outbox."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsOutbox, User
from app.models.enums import DataQsOutboxStatus
from app.services import dataqs_notifications
from app.services.dataqs_email import EmailError
from app.services.dataqs_notifications import DataQsNotifications
from tests.dataqs.helpers import (
    approve,
    approved_case,
    assess,
    confirm_filing,
    log_in,
    ready_package,
    staff_case,
    start_filing,
    submitted_case,
)


class FakeSender:
    def __init__(self, fail: EmailError | None = None) -> None:
        self.sent: list[dict] = []
        self.fail = fail

    def send(self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str):
        if self.fail:
            raise self.fail
        self.sent.append({"to": to, "subject": subject, "text": text, "key": idempotency_key})
        return "email-id"


def _outbox(db: Session, case_id: int) -> list[DataQsOutbox]:
    return list(
        db.scalars(
            select(DataQsOutbox).where(DataQsOutbox.case_id == case_id).order_by(DataQsOutbox.id)
        )
    )


def _filed(api: TestClient) -> dict:
    case = approved_case(api)
    attempt = start_filing(api, case).json()["attempts"][-1]["id"]
    filed = confirm_filing(
        api, case, attempt, filed_at=(datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    )
    assert filed.status_code == 200, filed.text
    return filed.json()


def test_evidence_needed_emails_everyone_at_the_carrier(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    asked = assess(
        api,
        staff_case(api, case_id),
        "EVIDENCE_NEEDED",
        carrier_message="Please upload the full inspection report.",
    ).json()
    [message] = asked["messages"]
    assert message["kind"] == "EVIDENCE_NEEDED"
    assert "Please upload the full inspection report." in message["body"]
    assert set(message["recipients"]) == {"owner@acme.test", "viewer@acme.test"}
    assert message["delivery"] == "WAITING"

    sender = FakeSender()
    assert DataQsNotifications(db).deliver_due(sender) == 2
    assert {tuple(s["to"]) for s in sender.sent} == {("owner@acme.test",), ("viewer@acme.test",)}
    assert "/portal/dataqs/cases/" in sender.sent[0]["text"]  # a link to the case

    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert carrier["messages"][0]["delivery"] == "SENT"
    assert carrier["messages"][0]["recipients"] == []  # addresses are STS-only detail
    assert carrier["emails"] is None


def test_filing_emails_the_carrier_and_schedules_staff_reminders(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _filed(api)
    kinds = [m["kind"] for m in case["messages"]]
    assert kinds[0] == "FILED" and "PACKAGE_READY" in kinds
    reminders = [row for row in _outbox(db, case["id"]) if row.kind.startswith("REMINDER_")]
    assert sorted(row.kind for row in reminders) == ["REMINDER_21_DAYS", "REMINDER_7_DAYS"]

    sender = FakeSender()
    notifications = DataQsNotifications(db)
    notifications.deliver_due(sender)  # carrier emails go now; reminders are not due yet
    assert not any("days since filing" in s["subject"] for s in sender.sent)

    sender = FakeSender()
    notifications.deliver_due(sender, now=datetime.now(UTC) + timedelta(days=8))
    [seven] = sender.sent
    assert "7 days since filing" in seven["subject"]
    assert seven["to"] == ["analyst@sts.test"]  # the case specialist
    assert "/dataqs/cases/" in seven["text"]

    sender = FakeSender()
    notifications.deliver_due(sender, now=datetime.now(UTC) + timedelta(days=22))
    [twenty_one] = sender.sent
    assert "21 days since filing" in twenty_one["subject"]


def test_closing_the_file_emails_the_carrier_and_cancels_reminders(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _filed(api)
    closed = api.post(
        f"/api/v1/dataqs/cases/{case['id']}/close",
        json={
            "expected_version": case["row_version"],
            "note": "We will watch the next SMS update.",
        },
    )
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert (body["work_status"], body["outcome"]) == ("CLOSED", "WITHDRAWN")
    assert body["tasks"] == [] and body["clocks"] == []
    message = body["messages"][0]
    assert (message["kind"], message["subject"]) == (
        "FILE_CLOSED",
        f"Your DataQs file {case['id']} is closed",
    )
    assert "We will watch the next SMS update." in message["body"]
    statuses = {row.kind: row.status for row in _outbox(db, case["id"])}
    assert statuses["REMINDER_7_DAYS"] == DataQsOutboxStatus.CANCELLED
    assert statuses["REMINDER_21_DAYS"] == DataQsOutboxStatus.CANCELLED
    assert body["can_close"] is False

    again = api.post(
        f"/api/v1/dataqs/cases/{case['id']}/close",
        json={"expected_version": body["row_version"], "note": "Closing again"},
    )
    assert again.status_code == 409


def test_staff_email_the_carrier_from_the_case(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    sent = api.post(
        f"/api/v1/dataqs/cases/{case_id}/messages",
        json={"subject": "One more document", "body": "Please send the trailer lease agreement."},
    )
    assert sent.status_code == 200, sent.text
    [message] = sent.json()["messages"]
    assert (message["kind"], message["author_name"]) == ("MESSAGE", "Analyst")
    assert [e["kind"] for e in sent.json()["emails"]] == ["MESSAGE", "MESSAGE"]

    log_in(api, "owner@acme.test")
    denied = api.post(
        f"/api/v1/dataqs/cases/{case_id}/messages", json={"subject": "Hi", "body": "Hello STS"}
    )
    assert denied.status_code == 403  # carriers reply by email; this route is STS-only


def test_failed_emails_are_retried_then_given_up(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    api.post(
        f"/api/v1/dataqs/cases/{case_id}/messages",
        json={"subject": "Hello", "body": "Testing delivery"},
    )
    notifications = DataQsNotifications(db)
    notifications.deliver_due(FakeSender(fail=EmailError("timeout")))
    rows = [r for r in _outbox(db, case_id) if r.kind == "MESSAGE"]
    assert all(r.status == DataQsOutboxStatus.PENDING and r.attempts == 1 for r in rows)
    assert all(r.next_attempt_at and r.last_error == "timeout" for r in rows)

    later = datetime.now(UTC) + timedelta(hours=1)
    notifications.deliver_due(FakeSender(fail=EmailError("bad address", permanent=True)), now=later)
    assert all(r.status == DataQsOutboxStatus.FAILED for r in rows)


def test_opened_event_completes_the_seven_day_check(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    opened = api.post(
        f"/api/v1/dataqs/cases/{case['id']}/correspondence",
        json={
            "expected_version": case["row_version"],
            "kind": "OPENED",
            "text": "Opened by NE SP",
            "occurred_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
            "assigned_agency": "NE SP",
            "portal_status": "Open - In Review",
        },
    )
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert not any(t["kind"] == "CHECK_OPENED" for t in body["tasks"])
    assert body["government_raw_status"] == "Open - In Review"
    assert body["attempts"][-1]["assigned_agency"] == "NE SP"


def test_the_package_names_the_dataqs_reason_and_where_the_data_was_seen(
    api: TestClient, world: dict[str, User]
) -> None:
    _, case = ready_package(api)
    manifest = case["packages"][0]["manifest"]
    assert manifest["dataqs_reason"] == "VIOLATION_INCORRECT"
    assert manifest["dataqs_reason_label"].startswith("Violation is incorrect")
    assert manifest["viewed_in"] == "A&I/SMS Results"
    assert manifest["evidence"][0]["title"]  # every file has a title for DataQs

    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert approve(api, carrier, carrier["packages"][0]).status_code == 200


@pytest.mark.parametrize("reason", ["UNSURE"])
def test_a_package_needs_a_real_dataqs_reason(
    api: TestClient, world: dict[str, User], reason: str
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    ready = assess(api, staff_case(api, case_id), "READY_TO_PREPARE").json()
    response = api.post(
        f"/api/v1/dataqs/cases/{case_id}/packages",
        json={
            "expected_version": ready["row_version"],
            "dataqs_reason": reason,
            "viewed_in": "A&I/SMS Results",
            "narrative": "x" * 60,
            "evidence_ids": [],
        },
    )
    assert response.status_code == 422


def test_test_routing_sends_carrier_and_staff_emails_to_set_addresses(
    api: TestClient, world: dict[str, User], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "dataqs_email_carrier_override", "carrier-test@sts.test")
    monkeypatch.setattr(get_settings(), "dataqs_email_staff_override", "staff-test@sts.test")
    case = _filed(api)
    filed = next(m for m in case["messages"] if m["kind"] == "FILED")
    assert filed["recipients"] == ["carrier-test@sts.test"]

    sender = FakeSender()
    notifications = DataQsNotifications(db)
    notifications.deliver_due(sender)
    carrier_emails = [s for s in sender.sent if "days since filing" not in s["subject"]]
    assert carrier_emails and all(s["to"] == ["carrier-test@sts.test"] for s in carrier_emails)
    assert "meant for owner@acme.test, viewer@acme.test" in carrier_emails[0]["text"]

    sender = FakeSender()
    notifications.deliver_due(sender, now=datetime.now(UTC) + timedelta(days=8))
    [reminder] = sender.sent
    assert reminder["to"] == ["staff-test@sts.test"]
    assert "meant for analyst@sts.test" in reminder["text"]


def test_a_committed_carrier_email_wakes_the_dispatcher(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    dataqs_notifications._wake.clear()
    sent = api.post(
        f"/api/v1/dataqs/cases/{case_id}/messages",
        json={"subject": "Hello", "body": "Sent straight away"},
    )
    assert sent.status_code == 200, sent.text
    assert dataqs_notifications._wake.is_set()  # sent now, not at the next 30-second round

    dataqs_notifications._wake.clear()
    db.info[dataqs_notifications._QUEUED] = True
    db.rollback()  # nothing was saved: no wake, and the flag is forgotten
    db.commit()
    assert not dataqs_notifications._wake.is_set()
