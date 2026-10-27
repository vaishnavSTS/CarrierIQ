"""Booking a call with STS: the case page gets a signed booking link from STS's website
(reason "other", labelled "DataQs case call") and the client books a free time there."""

import json
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.main import app
from app.models import DataQsOutbox, User
from app.services.dataqs_call_link import get_booking_transport
from tests.dataqs.helpers import USDOT, log_in, staff_case, submitted_case

TOKEN = "test-schedule-token"
LINK = "https://skytransportsolutions.com/schedule-appointment.html?service_id=291&sig=abc"


class FakeWebsite:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.answer: tuple[int, dict] = (200, {"success": True, "url": LINK})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        status, body = self.answer
        return httpx.Response(status, json=body)


@pytest.fixture
def website(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeWebsite]:
    monkeypatch.setattr(get_settings(), "sts_schedule_link_token", TOKEN)
    fake = FakeWebsite()
    app.dependency_overrides[get_booking_transport] = lambda: httpx.MockTransport(fake)
    yield fake
    app.dependency_overrides.pop(get_booking_transport, None)


def link(api: TestClient, case_id: int, base: str = "/api/v1/portal/dataqs") -> httpx.Response:
    return api.post(f"{base}/cases/{case_id}/call-link")


def test_the_client_gets_a_signed_booking_link(
    api: TestClient, world: dict[str, User], website: FakeWebsite
) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    answer = link(api, case["id"])
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"url": LINK}

    [sent] = website.requests
    assert sent.url == get_settings().sts_schedule_link_url
    assert sent.headers["X-Schedule-Link-Token"] == TOKEN
    assert TOKEN not in str(sent.url)  # never in the URL (request logs)
    body = json.loads(sent.content)
    assert body["dot"] == str(USDOT) and body["reason"] == "other"
    assert body["reasonLabel"] == "DataQs case call"
    assert body["email"] == "owner@acme.test"
    assert f"DataQs case {case['id']}" in body["note"]

    log_in(api, "analyst@sts.test")
    actions = [e["action"] for e in staff_case(api, case["id"])["audit"]]
    assert "call.booking_link" in actions


def test_staff_links_use_the_company_email_on_file(
    api: TestClient, world: dict[str, User], website: FakeWebsite
) -> None:
    case = submitted_case(api)
    log_in(api, "analyst@sts.test")
    assert link(api, case["id"], "/api/v1/dataqs").status_code == 200
    assert "email" not in json.loads(website.requests[0].content)


def test_a_company_not_on_the_website_tells_sts(
    api: TestClient, world: dict[str, User], website: FakeWebsite, db: Session
) -> None:
    case = submitted_case(api)
    website.answer = (400, {"success": False, "error": "Company not found."})
    log_in(api, "owner@acme.test")
    answer = link(api, case["id"])
    assert answer.status_code == 422 and "isn't set up for online booking" in answer.text
    [notice] = db.scalars(
        select(DataQsOutbox).where(
            DataQsOutbox.case_id == case["id"], DataQsOutbox.kind == "NOTICE_BOOKING_NOT_SET_UP"
        )
    )
    assert "Company not found." in notice.payload["body"]


def test_not_set_up_or_down(
    api: TestClient,
    world: dict[str, User],
    website: FakeWebsite,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    website.answer = (500, {"success": False, "error": "Unexpected server error"})
    assert link(api, case["id"]).status_code == 503
    monkeypatch.setattr(get_settings(), "sts_schedule_link_token", None)
    answer = link(api, case["id"])
    assert answer.status_code == 503 and "isn't set up yet" in answer.text
    log_in(api, "viewer@acme.test")  # viewers can't act on the case
    assert link(api, case["id"]).status_code == 403
