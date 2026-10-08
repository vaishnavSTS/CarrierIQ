"""Authority endpoint, profile insurance status and timeline (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.db.session import get_db
from app.main import app
from tests.services.fmcsa import fmcsa_api


@pytest.fixture
def api_client(db: Session) -> Iterator[TestClient]:
    api = fmcsa_api()

    def fake_client() -> Iterator[Any]:
        yield api.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_authority_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/295017/authority")

    assert response.status_code == 200
    body = response.json()
    (docket,) = body["dockets"]
    assert (docket["prefix"], docket["number"], docket["status"], docket["status_source"]) == (
        "MC",
        "139446",
        "ACTIVE",
        "MOTUS",
    )
    assert docket["authority_type"] == "Motor Carrier of Household Goods"
    assert float(docket["bipd_on_file"]) == 1_000_000
    assert {f["insurance_type"] for f in body["current_insurance"]} == {"BIPD", "CARGO"}
    assert len(body["insurance_history"]) == 10
    history = body["insurance_history"]
    assert history[0]["termination_date"] >= history[-1]["termination_date"]  # newest first

    actions = [(a["action_date"], a["action"]) for a in body["authority_history"]]
    assert actions.count(("2021-06-15", "REINSTATED")) == 1  # reported by both systems
    assert ("2021-06-08", "REVOKED") in actions
    assert actions == sorted(actions, key=lambda a: a[0] or "", reverse=True)


def test_profile_reports_insurance_status_and_timeline(api_client: TestClient) -> None:
    body = api_client.get("/api/v1/carriers/295017").json()

    assert body["insurance"] == {
        "status": "ON_FILE",
        "source_system": "MOTUS",
        "as_of": body["insurance"]["as_of"],
    }
    assert body["insurance"]["as_of"] is not None
    revoked = next(e for e in body["timeline"] if e["event_type"] == "AUTHORITY_REVOKED")
    assert (revoked["event_date"], revoked["severity"]) == ("2021-06-08", "HIGH")


def test_search_result_carries_insurance_status(api_client: TestClient) -> None:
    (result,) = api_client.get("/api/v1/carriers/search", params={"q": "295017"}).json()["results"]

    assert result["insurance_status"] == "ON_FILE"


def test_unknown_carrier_is_404(api_client: TestClient) -> None:
    assert api_client.get("/api/v1/carriers/999999/authority").status_code == 404
