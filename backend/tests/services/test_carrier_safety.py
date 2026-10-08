"""Safety and inspection-history endpoints (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.db.session import get_db
from app.main import app
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows, load_violation_rows
from tests.services.test_carrier_search import UNITED


@pytest.fixture
def api_client(db: Session) -> Iterator[TestClient]:
    headers, units = load_inspection_rows()
    api = FakeDotApi([UNITED], headers, units, load_violation_rows())

    def fake_client() -> Iterator[Any]:
        yield api.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_safety_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/295017/safety")

    assert response.status_code == 200
    body = response.json()
    assert body["inspection_count"] == 4
    quarters = {q["quarter"]: q for q in body["quarters"]}
    assert body["quarters"][0]["quarter"] == "2024-Q4"
    assert quarters["2024-Q4"]["vehicle_oos"] == 1
    assert quarters["2025-Q1"]["inspections"] == 0  # gap filled
    assert [(c["key"], c["inspections"]) for c in body["by_level"]] == [("2", 1), ("3", 3)]
    assert body["by_state"] == [{"key": "WA", "inspections": 4}]

    violations = body["violations"]
    assert (violations["total"], violations["header_total"]) == (9, 9)
    assert (violations["driver"], violations["vehicle"], violations["out_of_service"]) == (3, 6, 1)
    assert violations["by_part"][0] == {
        "part": 392,
        "title": "Driving of commercial motor vehicles",
        "violations": 5,
        "out_of_service": 0,
    }
    assert violations["top_codes"][0]["code"] == "392.2-SLLSR"  # appears twice
    assert violations["top_codes"][0]["violations"] == 2


def test_inspection_history_pages_newest_first_with_violations(api_client: TestClient) -> None:
    first = api_client.get("/api/v1/carriers/295017/inspections", params={"page_size": 3}).json()
    second = api_client.get(
        "/api/v1/carriers/295017/inspections", params={"page_size": 3, "page": 2}
    ).json()

    assert first["total"] == 4
    assert [i["inspection_id"] for i in first["inspections"]] == [
        "87518319",
        "86137641",
        "85796455",
    ]
    assert [i["inspection_id"] for i in second["inspections"]] == ["82915718"]
    oldest = second["inspections"][0]
    assert oldest["violation_count"] == 3
    assert [v["code"] for v in oldest["violations"]] == [
        "393.95A4-EEUS",
        "392.16B-DPASS",
        "393.9A-LTSI",
    ]


def test_inspection_history_out_of_service_only(api_client: TestClient) -> None:
    body = api_client.get("/api/v1/carriers/295017/inspections", params={"oos_only": "true"}).json()

    assert body["total"] == 1
    assert body["inspections"][0]["inspection_id"] == "82915718"


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page_size": 0}, {"page_size": 101}, {"oos_only": "maybe"}]
)
def test_inspection_history_rejects_bad_paging(
    api_client: TestClient, params: dict[str, Any]
) -> None:
    assert api_client.get("/api/v1/carriers/295017/inspections", params=params).status_code == 422


def test_unknown_carrier_is_404(api_client: TestClient) -> None:
    assert api_client.get("/api/v1/carriers/999999/safety").status_code == 404
    assert api_client.get("/api/v1/carriers/999999/inspections").status_code == 404
