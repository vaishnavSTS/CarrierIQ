"""Proof of filing: STS uploads the confirmation DataQs gave (PDF or screenshot) on the filing;
the carrier sees it on their case once the filing is confirmed and is emailed a link to it."""

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsMessage, DataQsOutbox, User
from tests.dataqs.helpers import (
    PDF,
    approved_case,
    confirm_filing,
    log_in,
    staff_case,
    start_filing,
)
from tests.dataqs.test_dataqs_filing import _post

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def add_proof(
    api: TestClient, case_id: int, attempt_id: int, data: bytes = PNG, name: str = "ack.png"
) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case_id}/submission-attempts/{attempt_id}/proofs",
        files={"file": (name, data, "application/octet-stream")},
    )


def outbox(db: Session, case_id: int, kind: str) -> list[DataQsOutbox]:
    return list(
        db.scalars(
            select(DataQsOutbox).where(DataQsOutbox.case_id == case_id, DataQsOutbox.kind == kind)
        )
    )


def test_proof_added_after_filing_emails_the_carrier_a_link(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = start_filing(api, approved_case(api)).json()
    attempt_id = case["attempts"][0]["id"]
    case = confirm_filing(api, case, attempt_id).json()

    added = add_proof(api, case["id"], attempt_id)
    assert added.status_code == 201, added.text
    [proof] = added.json()["attempts"][0]["proofs"]
    assert (proof["file_name"], proof["mime_type"], proof["size_bytes"]) == (
        "ack.png",
        "image/png",
        len(PNG),
    )
    assert proof["uploaded_by_name"] == "Analyst"

    # Each of the carrier's users is emailed a link to the case, not the file.
    emails = outbox(db, case["id"], "FILING_PROOF")
    assert len(emails) == len({e.recipient_id for e in emails}) >= 1
    for email in emails:
        assert "filing confirmation is ready" in email.payload["subject"]
        assert "RDR-2026-001234" in email.payload["subject"]
        assert "Proof of filing" in email.payload["text"]
        assert "/portal/dataqs/cases/" in email.payload["text"]
        assert "attachments" not in email.payload
    message = db.scalar(select(DataQsMessage).where(DataQsMessage.kind == "FILING_PROOF"))
    assert message is not None and message.case_id == case["id"]

    # The carrier sees and downloads it.
    log_in(api, "owner@acme.test")
    mine = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert [p["id"] for p in mine["attempts"][0]["proofs"]] == [proof["id"]]
    got = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}/filing-proofs/{proof['id']}")
    assert got.status_code == 200 and got.content == PNG
    assert got.headers["content-type"] == "image/png"
    assert "attachment" in got.headers["content-disposition"]

    log_in(api, "analyst@sts.test")
    actions = [e["action"] for e in staff_case(api, case["id"])["audit"]]
    assert "filing_proof.uploaded" in actions and "filing_proof.downloaded" in actions


def test_proof_added_before_confirming_goes_in_the_filed_email(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = start_filing(api, approved_case(api)).json()
    attempt_id = case["attempts"][0]["id"]

    added = add_proof(api, case["id"], attempt_id, PDF, "dataqs-confirmation.pdf")
    assert added.status_code == 201, added.text
    proof_id = added.json()["attempts"][0]["proofs"][0]["id"]
    assert outbox(db, case["id"], "FILING_PROOF") == []  # not filed yet: no email

    # Not confirmed: the carrier neither sees the attempt nor can download its proof.
    log_in(api, "owner@acme.test")
    path = f"/api/v1/portal/dataqs/cases/{case['id']}/filing-proofs/{proof_id}"
    assert api.get(path).status_code == 404

    log_in(api, "analyst@sts.test")
    assert confirm_filing(api, case, attempt_id).status_code == 200
    filed = outbox(db, case["id"], "FILED")
    assert filed and all("under Proof of filing" in e.payload["text"] for e in filed)
    assert outbox(db, case["id"], "FILING_PROOF") == []  # one email, not two

    log_in(api, "owner@acme.test")
    got = api.get(path)
    assert got.status_code == 200 and got.content == PDF


def test_filed_email_without_a_proof_does_not_mention_one(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = start_filing(api, approved_case(api)).json()
    confirm_filing(api, case, case["attempts"][0]["id"])
    filed = outbox(db, case["id"], "FILED")
    assert filed and not any("Proof of filing" in e.payload["text"] for e in filed)


def test_only_staff_upload_and_only_a_pdf_or_image(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = start_filing(api, approved_case(api)).json()
    attempt_id = case["attempts"][0]["id"]

    text = add_proof(api, case["id"], attempt_id, b"Request submitted", "ack.txt")
    assert text.status_code == 422 and "PDF, PNG or JPEG" in text.text
    assert add_proof(api, case["id"], attempt_id, b"", "ack.pdf").status_code == 422
    assert add_proof(api, case["id"], attempt_id + 999).status_code == 404

    abandoned = _post(api, case, attempt_id, "abandon", "Nothing was submitted in DataQs")
    assert abandoned.status_code == 200, abandoned.text
    assert add_proof(api, case["id"], attempt_id).status_code == 409

    log_in(api, "owner@acme.test")
    assert add_proof(api, case["id"], attempt_id).status_code == 403
