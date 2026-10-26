"""The Compliance tab: UCR status from FMCSA's SAFER query (a fake here), and clients' service
requests, emailed to STS and handled by staff. Uses the DataQs test world (Acme, its verified
carrier, STS staff)."""

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.compliance import get_request_email_sender, get_ucr_service
from app.main import app
from app.models import User
from app.services.ucr_service import UcrStatus, UcrYear, parse, required_years
from tests.dataqs.helpers import USDOT, log_in

PAGE = """<table><tr><td>Registration Year:</td><td>2026</td></tr>
<tr><td>Registration Update Date:</td><td>2025-10-30</td></tr>
<tr><td>Registration Fee Paid:</td><td>Y</td></tr>
<tr><td>Registration Year:</td><td>2025</td></tr>
<tr><td>Registration Update Date:</td><td>2024-11-05</td></tr>
<tr><td>Registration Fee Paid:</td><td>N</td></tr></table>"""


class FakeChecker:
    def __init__(self, status: UcrStatus) -> None:
        self.result = status

    def status(self, usdot_number: int) -> UcrStatus:
        return self.result


class FakeSender:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.fail = fail

    def send(self, *, to, subject, text, html, idempotency_key) -> str:
        if self.fail:
            raise RuntimeError("down")
        self.sent.append({"to": to, "subject": subject, "text": text})
        return "id"


@pytest.fixture
def sender(api: TestClient) -> Iterator[FakeSender]:
    fake = FakeSender()
    app.dependency_overrides[get_request_email_sender] = lambda: fake
    yield fake


def use_checker(years: list[UcrYear], error: str | None = None) -> None:
    status = UcrStatus(USDOT, years=years, checked_at=datetime.now(UTC), error=error)
    app.dependency_overrides[get_ucr_service] = lambda: FakeChecker(status)


def test_the_safer_ucr_page_is_read() -> None:
    assert [(y.year, y.fee_paid, y.updated) for y in parse(PAGE, USDOT)] == [
        (2026, True, date(2025, 10, 30)),
        (2025, False, date(2024, 11, 5)),
    ]
    assert required_years(date(2026, 10, 1)) == (2026, 2027)
    assert required_years(date(2026, 9, 30)) == (2026, None)


def test_ucr_status_for_the_clients_own_carrier(api: TestClient, world: dict[str, User]) -> None:
    use_checker([UcrYear(2026, True, None), UcrYear(2025, True, None)])
    log_in(api, "owner@acme.test")
    body = api.get(f"/api/v1/compliance/carriers/{USDOT}/ucr").json()
    assert body["registered_current"] is True
    assert body["source_url"].endswith(f"DOT_NUMBER={USDOT}")

    use_checker([], error="ConnectError")
    unknown = api.get(f"/api/v1/compliance/carriers/{USDOT}/ucr").json()
    assert unknown["registered_current"] is None and unknown["error"] == "ConnectError"

    log_in(api, "owner@other.test")
    assert api.get(f"/api/v1/compliance/carriers/{USDOT}/ucr").status_code == 404
    log_in(api, "analyst@sts.test")
    assert api.get(f"/api/v1/compliance/carriers/{USDOT}/ucr").status_code == 200


def test_a_client_asks_for_help_and_sts_is_emailed(
    api: TestClient, world: dict[str, User], sender: FakeSender
) -> None:
    log_in(api, "viewer@acme.test")  # any user of the company may ask
    created = api.post(
        f"/api/v1/compliance/carriers/{USDOT}/requests",
        json={"service": "UCR", "note": "Please file for 2027"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["service_label"] == "UCR registration filing"
    [email] = sender.sent
    assert f"USDOT {USDOT}" in email["subject"] and "Please file for 2027" in email["text"]
    assert "viewer@acme.test" in email["text"]

    mine = api.get(f"/api/v1/compliance/carriers/{USDOT}/requests").json()["requests"]
    assert [r["service"] for r in mine] == ["UCR"]
    log_in(api, "owner@other.test")
    assert (
        api.post(
            f"/api/v1/compliance/carriers/{USDOT}/requests", json={"service": "MVR"}
        ).status_code
        == 404
    )

    log_in(api, "analyst@sts.test")
    listed = api.get("/api/v1/compliance/requests?status=OPEN").json()["requests"]
    assert [r["organization_name"] for r in listed] == ["Acme"]
    handled = api.post(f"/api/v1/compliance/requests/{listed[0]['id']}/handled").json()
    assert handled["status"] == "HANDLED" and handled["handled_by_name"]
    assert api.get("/api/v1/compliance/requests?status=OPEN").json()["requests"] == []


def test_a_failed_email_keeps_the_request(api: TestClient, world: dict[str, User]) -> None:
    app.dependency_overrides[get_request_email_sender] = lambda: FakeSender(fail=True)
    log_in(api, "owner@acme.test")
    created = api.post(f"/api/v1/compliance/carriers/{USDOT}/requests", json={"service": "MVR"})
    assert created.status_code == 201
    log_in(api, "analyst@sts.test")
    [request] = api.get("/api/v1/compliance/requests").json()["requests"]
    assert request["email_error"] == "Email failed: RuntimeError"


def test_staff_and_brokers_cannot_file_requests(
    api: TestClient, world: dict[str, User], sender: FakeSender, db: Session
) -> None:
    log_in(api, "analyst@sts.test")
    response = api.post(f"/api/v1/compliance/carriers/{USDOT}/requests", json={"service": "MVR"})
    assert response.status_code == 403
    log_in(api, "b@broker.test")
    assert api.get("/api/v1/compliance/requests").status_code == 403
    assert sender.sent == []
