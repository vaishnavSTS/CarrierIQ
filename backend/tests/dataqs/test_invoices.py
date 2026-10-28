"""CarrierSafetyScan invoices: who sees them, paying an unpaid one, voiding, and Stripe's webhook
marking them paid (emails sent once) or refunded. Signatures follow Stripe's scheme."""

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Invoice, User
from app.models.enums import InvoiceStatus
from app.services.stripe_client import verify_webhook
from tests.dataqs.helpers import log_in
from tests.dataqs.test_compliance_payment import (  # noqa: F401 - fixtures
    CHECKOUT_URL,
    FakeStripe,
    carrier,
    pay,
    sender,
    stripe,
)
from tests.dataqs.test_compliance_tab import FakeSender

SECRET = "whsec_test"


def signed(api: TestClient, event: dict, secret: str = SECRET, at: int | None = None):
    payload = json.dumps(event).encode()
    t = at if at is not None else int(time.time())
    sig = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return api.post(
        "/api/v1/webhooks/stripe",
        content=payload,
        headers={"Stripe-Signature": f"t={t},v1={sig}", "Content-Type": "application/json"},
    )


def paid_event(invoice_id: int, payment_intent: str = "pi_1") -> dict:
    return {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "payment_status": "paid",
                "payment_intent": payment_intent,
                "metadata": {"invoice_id": str(invoice_id)},
            }
        },
    }


@pytest.fixture
def invoice_id(
    api: TestClient,
    world: dict[str, User],
    db: Session,
    stripe: FakeStripe,  # noqa: F811
    sender: FakeSender,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> int:
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", SECRET)
    carrier(db)
    log_in(api, "owner@acme.test")
    return int(pay(api, "MVR", "MVR").json()["request"]["invoice_id"])


def test_the_client_sees_and_pays_their_invoice(
    api: TestClient,
    invoice_id: int,
    stripe: FakeStripe,  # noqa: F811
) -> None:
    shown = api.get(f"/api/v1/invoices/{invoice_id}")
    assert shown.status_code == 200, shown.text
    body = shown.json()
    assert body["status"] == "UNPAID" and body["can_pay"] and not body["can_void"]
    assert body["issuer"]["name"] == "Sky Transport Solutions"
    assert body["issuer"]["city_state_zip"] == "TRACY, CA 95376"
    assert "$35 administrative fee" in body["dispute_policy"]
    assert [(line["item"], line["amount"]) for line in body["lines"]] == [("MVR REPORT", "35.00")]

    again = api.post(f"/api/v1/invoices/{invoice_id}/pay")
    assert again.status_code == 200 and again.json()["url"] == CHECKOUT_URL

    log_in(api, "owner@other.test")  # another company
    assert api.get(f"/api/v1/invoices/{invoice_id}").status_code == 404
    log_in(api, "analyst@sts.test")
    assert api.get(f"/api/v1/invoices/{invoice_id}").json()["can_void"] is True
    assert api.post(f"/api/v1/invoices/{invoice_id}/pay").status_code == 403
    assert any(i["id"] == invoice_id for i in api.get("/api/v1/invoices").json()["invoices"])


def test_stripe_marks_it_paid_once_and_emails(
    api: TestClient,
    db: Session,
    invoice_id: int,
    sender: FakeSender,  # noqa: F811
) -> None:
    before = len(sender.sent)
    answer = signed(api, paid_event(invoice_id))
    assert answer.status_code == 200 and answer.json() == {"result": "paid"}
    invoice = db.get(Invoice, invoice_id)
    assert invoice is not None
    db.refresh(invoice)
    assert invoice.status == InvoiceStatus.PAID and invoice.paid_at is not None
    assert invoice.stripe_payment_intent == "pi_1"
    emails = sender.sent[before:]
    assert any(
        e["to"] == ["owner@acme.test"] and "Payment received" in e["subject"] for e in emails
    )
    assert any("Paid: invoice" in e["subject"] for e in emails)
    for email in emails:  # both carry the paid invoice as a PDF
        [pdf] = email["files"]
        assert pdf.content_type == "application/pdf" and pdf.data.startswith(b"%PDF")
        assert pdf.filename == f"invoice-{invoice.number}.pdf"

    assert signed(api, paid_event(invoice_id)).json() == {"result": "already paid"}
    assert len(sender.sent) == before + len(emails)  # no second emails

    log_in(api, "owner@acme.test")
    body = api.get(f"/api/v1/invoices/{invoice_id}").json()
    assert body["status"] == "PAID" and not body["can_pay"]
    assert api.post(f"/api/v1/invoices/{invoice_id}/pay").status_code == 409

    refund = {
        "id": "evt_2",
        "type": "charge.refunded",
        "data": {"object": {"payment_intent": "pi_1", "refunded": True}},
    }
    assert signed(api, refund).json() == {"result": "refunded"}
    db.refresh(invoice)
    assert invoice.status == InvoiceStatus.REFUNDED


def test_bad_signatures_are_refused(api: TestClient, db: Session, invoice_id: int) -> None:
    assert signed(api, paid_event(invoice_id), secret="whsec_wrong").status_code == 403
    old = int(time.time()) - 3600
    assert signed(api, paid_event(invoice_id), at=old).status_code == 403
    assert api.post("/api/v1/webhooks/stripe", content=b"{}").status_code == 403
    invoice = db.get(Invoice, invoice_id)
    assert invoice is not None and invoice.status == InvoiceStatus.UNPAID
    assert verify_webhook(b"{}", "t=1,v1=abc") is None


def test_staff_void_an_unpaid_invoice(api: TestClient, invoice_id: int) -> None:
    assert api.post(f"/api/v1/invoices/{invoice_id}/void").status_code == 403  # a client
    log_in(api, "analyst@sts.test")
    voided = api.post(f"/api/v1/invoices/{invoice_id}/void")
    assert voided.status_code == 200 and voided.json()["status"] == "VOID"
    assert api.post(f"/api/v1/invoices/{invoice_id}/void").status_code == 409
    log_in(api, "owner@acme.test")
    assert api.post(f"/api/v1/invoices/{invoice_id}/pay").status_code == 409


def test_while_testing_the_client_email_goes_to_sts_only(
    api: TestClient,
    invoice_id: int,
    sender: FakeSender,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_email_staff_override", "vaishnav@sts.test")
    before = len(sender.sent)
    assert signed(api, paid_event(invoice_id)).json() == {"result": "paid"}
    emails = sender.sent[before:]
    assert emails and all(e["to"] == ["vaishnav@sts.test"] for e in emails)
    [client_copy] = [e for e in emails if "Payment received" in e["subject"]]
    assert "[Test routing: meant for owner@acme.test]" in client_copy["text"]


def test_the_invoice_downloads_as_a_pdf(api: TestClient, invoice_id: int) -> None:
    pdf = api.get(f"/api/v1/invoices/{invoice_id}/pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF") and b"Invoice " in pdf.content
    assert 'filename="invoice-' in pdf.headers["content-disposition"]
    log_in(api, "owner@other.test")  # another company
    assert api.get(f"/api/v1/invoices/{invoice_id}/pdf").status_code == 404


def test_one_carriers_invoices_for_staff_and_its_client(api: TestClient, invoice_id: int) -> None:
    usdot = api.get(f"/api/v1/invoices/{invoice_id}").json()["usdot_number"]
    # The client: their own company's invoices for the carrier (its profile's Invoices tab).
    mine = api.get(f"/api/v1/invoices?usdot_number={usdot}").json()["invoices"]
    assert [i["id"] for i in mine] == [invoice_id] and mine[0]["issued_at"]
    assert api.get("/api/v1/invoices").status_code == 403  # not every invoice
    log_in(api, "owner@other.test")  # another company sees none of them
    assert api.get(f"/api/v1/invoices?usdot_number={usdot}").json()["invoices"] == []
    log_in(api, "analyst@sts.test")
    assert [
        i["id"] for i in api.get(f"/api/v1/invoices?usdot_number={usdot}").json()["invoices"]
    ] == [invoice_id]
    assert api.get("/api/v1/invoices?usdot_number=1").json()["invoices"] == []
