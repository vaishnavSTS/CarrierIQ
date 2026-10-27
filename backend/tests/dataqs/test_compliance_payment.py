"""Paying for a Compliance tab service: the client picks an option, CarrierSafetyScan creates the
invoice on STS's website (a fake here) and answers its payment page; STS is emailed."""

import json
from collections.abc import Iterator
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.compliance import get_invoice_client, get_request_email_sender
from app.core.config import get_settings
from app.main import app
from app.models import Address, Carrier, User
from app.models.enums import AddressType
from app.services.sts_invoice import StsInvoiceClient
from tests.dataqs.helpers import USDOT, log_in
from tests.dataqs.test_compliance_tab import FakeSender
from tests.factories import make_raw_record

TOKEN = "test-invoice-token"
PAY = "http://skytransportsolutions.com/payment.html?a=abc"


class FakeWebsite:
    def __init__(self) -> None:
        self.bodies: list[dict] = []
        self.answer: tuple[int, dict] = (
            200,
            {
                "success": True,
                "invoice_id": 74779,
                "invoice_no": 53448,
                "amount": 0,
                "payment_url": PAY,
            },
        )

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.bodies.append(json.loads(request.content))
        status, body = self.answer
        return httpx.Response(status, json=body)


@pytest.fixture
def website(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeWebsite]:
    monkeypatch.setattr(get_settings(), "sts_invoice_api_token", TOKEN)
    fake = FakeWebsite()
    app.dependency_overrides[get_invoice_client] = lambda: StsInvoiceClient(
        httpx.MockTransport(fake)
    )
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
            state=state,
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
    assert [o["key"] for o in services["DOT_MC_AUTHORITY"]["options"]] == [
        "ASSISTANCE",
        "REINSTATEMENT",
        "REVOKED",
    ]


def test_paying_creates_the_website_invoice_and_tells_sts(
    api: TestClient,
    world: dict[str, User],
    db: Session,
    website: FakeWebsite,
    sender: FakeSender,
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    paid = pay(api, "UCR", "TRUCKS_3_5", note="Please file for 2027")
    assert paid.status_code == 200, paid.text
    body = paid.json()
    assert body["payment_url"] == PAY.replace("http://", "https://")
    request = body["request"]
    assert (request["invoice_no"], request["amount"], request["option_label"]) == (
        53448,
        "277.00",
        "3–5 trucks",
    )

    [sent] = website.bodies
    assert sent["token"] == TOKEN and sent["dot"] == str(USDOT)
    assert sent["source"] == "carriersafetyscan" and sent["created_by"] == 0
    assert sent["services"] == [
        {
            "service_id": 1,
            "amount": 277.0,
            "qnt": 1,
            "description": "UCR registration filing: 3–5 trucks",
        }
    ]
    assert sent["company"]["email"] == "owner@acme.test"

    [email] = sender.sent
    assert "invoice 53448" in email["text"] and "$277.00" in email["text"]

    # Paying again for the same thing reuses the invoice: no second invoice or email.
    again = pay(api, "UCR", "TRUCKS_3_5")
    assert again.json()["payment_url"] == body["payment_url"]
    assert len(website.bodies) == 1 and len(sender.sent) == 1


def test_driver_files_are_priced_per_driver(
    api: TestClient, world: dict[str, User], db: Session, website: FakeWebsite, sender: FakeSender
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    assert pay(api, "DRIVER_FILES", "DRIVERS_1_5", drivers=8).status_code == 422  # wrong tier
    paid = pay(api, "DRIVER_FILES", "DRIVERS_6_15", drivers=8)
    assert paid.status_code == 200, paid.text
    assert paid.json()["request"]["amount"] == "320.00"
    line = website.bodies[0]["services"][0]
    assert (line["service_id"], line["amount"], line["qnt"]) == (14, 40.0, 8)


def test_california_mcp_only_for_california(
    api: TestClient, world: dict[str, User], db: Session, website: FakeWebsite, sender: FakeSender
) -> None:
    carrier(db, state="TX")
    log_in(api, "owner@acme.test")
    assert pay(api, "CA_MCP", "TRUCKS_1").status_code == 422
    assert website.bodies == []


def test_refusals(
    api: TestClient,
    world: dict[str, User],
    db: Session,
    website: FakeWebsite,
    sender: FakeSender,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    carrier(db)
    log_in(api, "owner@acme.test")
    assert pay(api, "DRUG_ALCOHOL", "ANY").status_code == 422  # not paid online yet
    assert pay(api, "MVR", "NOPE").status_code == 422
    website.answer = (409, {"success": False, "code": "already_exists", "message": "dup"})
    assert "already an invoice" in pay(api, "MVR", "MVR").text
    website.answer = (500, {"success": False, "message": "boom"})
    assert pay(api, "MVR", "MVR").status_code == 503
    monkeypatch.setattr(get_settings(), "sts_invoice_api_token", None)
    assert "isn't set up yet" in pay(api, "MVR", "MVR").text
    log_in(api, "analyst@sts.test")  # staff don't pay for clients
    assert pay(api, "MVR", "MVR").status_code == 403
