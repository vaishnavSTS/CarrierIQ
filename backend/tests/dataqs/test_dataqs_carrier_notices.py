"""Carriers can add evidence while STS has the case, and STS is emailed straight away about what
the carrier did: each new file, the case sent back, the package approved or questioned.
The email goes to the case specialist (STS admins while nobody owns the case)."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsOutbox, User
from app.services.dataqs_notifications import DataQsNotifications
from tests.dataqs.helpers import (
    approve,
    assess,
    create_case,
    log_in,
    ready_package,
    staff_case,
    submitted_case,
    upload,
)


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str):
        self.sent.append({"to": to, "subject": subject, "text": text})
        return "email-id"

    def to(self, address: str) -> list[dict]:
        """Only the emails to one person (carrier emails are queued along the way too)."""
        return [e for e in self.sent if e["to"] == [address]]


def notices(db: Session, case_id: int) -> list[DataQsOutbox]:
    return list(
        db.scalars(
            select(DataQsOutbox).where(
                DataQsOutbox.case_id == case_id, DataQsOutbox.kind.like("NOTICE_%")
            )
        )
    )


def carrier_view(api: TestClient, case_id: int) -> dict:
    log_in(api, "owner@acme.test")
    return api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()


def test_each_new_file_while_the_package_waits_tells_sts_straight_away(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id, case = ready_package(api)  # AWAITING_APPROVAL, as STS staff see it
    assigned = api.post(
        f"/api/v1/dataqs/cases/{case_id}/owner",
        json={"expected_version": case["row_version"], "owner_id": world["staff"].id},
    )
    assert assigned.status_code == 200, assigned.text
    case = carrier_view(api, case_id)
    assert case["work_status"] == "AWAITING_APPROVAL" and case["can_upload"]
    assert upload(api, case, name="lease.pdf").status_code == 201
    assert upload(api, case, name="bill-of-lading.pdf").status_code == 201

    assert [n.kind for n in notices(db, case_id)] == ["NOTICE_EVIDENCE_ADDED"] * 2
    log_in(api, "analyst@sts.test")
    tasks = [t["kind"] for t in staff_case(api, case_id)["tasks"]]
    assert tasks.count("REVIEW_NEW_EVIDENCE") == 1

    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender)  # no waiting: sent with the next round
    lease, bill = sender.to("analyst@sts.test")  # the case specialist, one email per file
    assert lease["subject"] == f"New evidence from the carrier: DataQs case {case_id}"
    assert "lease.pdf" in lease["text"] and "bill-of-lading.pdf" in bill["text"]
    assert "How it supports the issue: Adjustment record that day" in lease["text"]
    assert "Owner (ACME HAULING LLC) added a file" in lease["text"]


def test_a_draft_upload_is_not_news_for_sts(api: TestClient, world: dict[str, User], db: Session):
    log_in(api, "owner@acme.test")
    case = create_case(api)
    assert upload(api, case).status_code == 201
    assert notices(db, case["id"]) == []


def test_sts_hears_when_the_carrier_sends_the_case_back(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    asked = assess(
        api, staff_case(api, case_id), "EVIDENCE_NEEDED", carrier_message="Send the lease."
    )
    assert asked.status_code == 200, asked.text
    case = carrier_view(api, case_id)
    assert upload(api, case, name="lease.pdf").status_code == 201
    assert notices(db, case_id) == []  # STS asked for it: the send-back tells STS
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    back = api.post(
        f"/api/v1/portal/dataqs/cases/{case_id}/resubmit",
        json={"expected_version": case["row_version"]},
    )
    assert back.status_code == 200, back.text

    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender)
    [email] = sender.to("analyst@sts.test")  # the assessor owns the case
    assert email["subject"] == f"The carrier sent DataQs case {case_id} back to STS"


def test_sts_hears_when_the_carrier_approves_the_package(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id, _ = ready_package(api)
    case = carrier_view(api, case_id)
    assert approve(api, case, case["packages"][0]).status_code == 200
    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender)
    [email] = sender.to("analyst@sts.test")
    assert email["subject"] == f"Approved: file DataQs case {case_id} (package v1)"


def test_sts_hears_when_the_carrier_asks_for_changes(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id, _ = ready_package(api)
    case = carrier_view(api, case_id)
    asked = api.post(
        f"/api/v1/portal/dataqs/cases/{case_id}/package-changes",
        json={"expected_version": case["row_version"], "message": "Mention the lease too."},
    )
    assert asked.status_code == 200, asked.text
    sender = FakeSender()
    DataQsNotifications(db).deliver_due(sender)
    [email] = sender.to("analyst@sts.test")
    assert email["subject"] == f"The carrier asked for changes: DataQs case {case_id}"
    assert "Mention the lease too." in email["text"]
