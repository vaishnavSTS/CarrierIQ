"""Paying for a Compliance tab service: the client picks an option, CarrierSafetyScan creates its
own invoice and a Stripe Checkout session (a fake Stripe here); STS is emailed."""

from collections.abc import Iterator
from datetime import date
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.compliance import get_request_email_sender, get_stripe_client
from app.core.config import get_settings
from app.main import app
from app.models import Address, Carrier, Invoice, InvoiceLine, User
from app.models.enums import AddressType
from app.services.stripe_client import StripeClient
from tests.dataqs.helpers import USDOT, log_in
from tests.dataqs.test_compliance_tab import FakeSender
from tests.factories import make_raw_record

CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_1"


class FakeStripe:
    def __init__(self) -> None:
        self.forms: list[dict[str, str]] = []
        self.answer: tuple[int, dict] = (200, {"id": "cs_test_1", "url": CHECKOUT_URL})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/checkout/sessions"
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        self.forms.append(form)
        status, body = self.answer
        return httpx.Response(status, json=body)


@pytest.fixture
def stripe(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStripe]:
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_fake")
    fake = FakeStripe()
    app.dependency_overrides[get_stripe_client] = lambda: StripeClient(httpx.MockTransport(fake))
    yield fake


@pytest.fixture
def sender(api: TestClient) -> FakeSender:
    fake = FakeSender()
    app.dependency_overrides[get_request_email_sender] = lambda: fake
    return fake


def carrier(db: Session, state: str = "TX", trucks: int | None = 4, drivers: int | None = 7):
    row = db.scalar(select(Carrier).where(Carrier.usdot_number == USDOT))
    assert row is not None
    row.fleet_size, row.driver_count = trucks, drivers
    raw = make_raw_record(db, external_id=str(USDOT))
    db.add(
        Address(
            carrier_id=row.id,
            address_type=AddressType.PHYSICAL,
            street="1530 GREENWICH CIR",
            city="YUBA CITY",
            state=state,
            zip="95993",
            first_seen=date(2026, 1, 1),
            last_seen=date(2026, 10, 1),
            source=raw.source,
            raw_record_id=raw.id,
        )
    )
    db.commit()


def pay(api: TestClient, service: str, option: str, **extra) -> httpx.Response:
    return api.post(
        f"/api/v1/compliance/carriers/{USDOT}/checkout",
        json={"service": service, "option": option, **extra},
    )


def test_prices_fit_the_carrier(api: TestClient, world: dict[str, User], db: Session) -> None:
    carrier(db, state="TX", trucks=4, drivers=7)
    log_in(api, "owner@acme.test")
    services = {
        s["service"]: s
        for s in api.get(f"/api/v1/compliance/carriers/{USDOT}/prices").json()["services"]
    }
    assert "CA_MCP" not in services  # not a California carrier
    assert "DRUG_ALCOHOL" not in services and "BACKGROUND_CHECK" not in services  # no id yet
    assert services["UCR"]["suggested"] == "TRUCKS_3_5"
    assert [o["amount"] for o in services["UCR"]["options"]] == ["100", "277", "418", "1360"]
    assert services["DRIVER_FILES"]["per_driver"] and services["DRIVER_FILES"]["drivers"] == 7
    assert services["DRIVER_FILES"]["suggested"] == "DRIVERS_6_15"


def test_paying_creates_our_invoice_and_a_stripe_checkout(
    api: TestClient, world: dict[str, User], db: Session, stripe: FakeStripe, sender: FakeSender
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    paid = pay(api, "UCR", "TRUCKS_3_5")
    assert paid.status_code == 200, paid.text
    body = paid.json()
    assert body["payment_url"] == CHECKOUT_URL
    request = body["request"]
    assert (request["amount"], request["option_label"], request["invoice_status"]) == (
        "277.00",
        "3–5 trucks",
        "UNPAID",
    )

    invoice = db.get(Invoice, request["invoice_id"])
    assert invoice is not None and invoice.number == request["invoice_number"] >= 1001
    assert invoice.total == 277 and invoice.stripe_session_id == "cs_test_1"
    assert invoice.bill_to["name"] == "ACME HAULING LLC"
    assert invoice.bill_to["city_state_zip"] == "YUBA CITY, TX 95993"
    assert "owner@acme.test" in invoice.bill_to["emails"]
    [line] = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
    assert (line.item, line.description, line.quantity, line.rate) == (
        "UCR (3–5 TRUCKS)",
        "Service",
        1,
        277,
    )

    [form] = stripe.forms
    assert form["mode"] == "payment" and form["metadata[invoice_id]"] == str(invoice.id)
    assert form["line_items[0][price_data][unit_amount]"] == "27700"
    assert form["line_items[0][price_data][product_data][name]"] == "UCR (3–5 TRUCKS)"
    assert form["customer_email"] == "owner@acme.test"
    assert form["success_url"].endswith(f"/portal/invoices/{invoice.id}?paid=1")

    [email] = sender.sent
    assert f"Invoice {invoice.number}" in email["text"] and "$277.00" in email["text"]

    # The same choice again while unpaid: the same invoice, a fresh Stripe session, no new email.
    again = pay(api, "UCR", "TRUCKS_3_5")
    assert again.json()["request"]["invoice_id"] == invoice.id
    assert len(stripe.forms) == 2 and len(sender.sent) == 1
    assert db.scalar(select(Invoice).where(Invoice.id != invoice.id)) is None


def test_driver_files_are_priced_per_driver(
    api: TestClient, world: dict[str, User], db: Session, stripe: FakeStripe, sender: FakeSender
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    assert pay(api, "DRIVER_FILES", "DRIVERS_1_5", drivers=8).status_code == 422  # wrong tier
    paid = pay(api, "DRIVER_FILES", "DRIVERS_6_15", drivers=8)
    assert paid.status_code == 200, paid.text
    assert paid.json()["request"]["amount"] == "320.00"
    form = stripe.forms[0]
    assert form["line_items[0][quantity]"] == "8"
    assert form["line_items[0][price_data][unit_amount]"] == "4000"


def test_california_mcp_only_for_california(
    api: TestClient, world: dict[str, User], db: Session, stripe: FakeStripe, sender: FakeSender
) -> None:
    carrier(db, state="TX")
    log_in(api, "owner@acme.test")
    assert pay(api, "CA_MCP", "TRUCKS_1").status_code == 422
    assert stripe.forms == []


def test_refusals(
    api: TestClient,
    world: dict[str, User],
    db: Session,
    stripe: FakeStripe,
    sender: FakeSender,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    assert pay(api, "DRUG_ALCOHOL", "ANY").status_code == 422  # not paid online yet
    assert pay(api, "MVR", "NOPE").status_code == 422
    stripe.answer = (400, {"error": {"message": "Invalid API key"}})
    assert pay(api, "MVR", "MVR").status_code == 503
    monkeypatch.setattr(get_settings(), "stripe_secret_key", None)
    assert "isn't set up yet" in pay(api, "MVR", "MVR").text
    log_in(api, "analyst@sts.test")  # staff don't pay for clients
    assert pay(api, "MVR", "MVR").status_code == 403
    # Stripe refused once (a 503 after the invoice was made); with no key, none is made at all.
    assert len(list(db.scalars(select(Invoice)))) == 1
