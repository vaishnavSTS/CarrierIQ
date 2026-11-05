"""The carrier map API: state totals and one state's carriers, from a fake census (no network)."""

from collections.abc import Iterator
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.v1.routes.directory import get_carrier_directory
from app.db.session import get_db
from app.main import app
from app.services import carrier_directory
from app.services.carrier_directory import CarrierDirectory


class FakeCensus:
    """Answers like the Socrata client, and records each query."""

    def __init__(self) -> None:
        self.queries: list[dict[str, str]] = []

    def get_rows(self, dataset_id: str, params: dict[str, str]) -> list[dict]:
        self.queries.append(params)
        if params.get("$group") == "phy_state":
            if "add_date >=" in params["$where"]:
                return [{"phy_state": "TX", "n": "702"}]
            return [
                {"phy_state": "TX", "n": "70000"},
                {"phy_state": "CA", "n": "90000"},
                {"phy_state": "ON", "n": "5"},  # a Canadian province: not on the map
            ]
        return [
            {
                "dot_number": "4382997",
                "legal_name": "BIG NEW FLEET LLC",
                "phy_city": "THOMSON",
                "phy_cnty": "189",
                "power_units": "80000",
                "total_drivers": "3",
                "add_date": "20260101",
            },
            {
                "dot_number": "21800",
                "legal_name": "OLD CARRIER INC",
                "phy_city": "ATLANTA",
                "power_units": "1200",
                "add_date": "19800101",
                "phone": "5550000000",  # never passed on
            },
        ]


@pytest.fixture
def census() -> FakeCensus:
    return FakeCensus()


@pytest.fixture
def api(census: FakeCensus) -> Iterator[TestClient]:
    carrier_directory.clear_cache()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_carrier_directory] = lambda: CarrierDirectory(
        census,  # type: ignore[arg-type]
        today=lambda: date(2026, 11, 4),
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    carrier_directory.clear_cache()


def test_state_counts_cover_every_state_and_are_cached(api: TestClient, census: FakeCensus):
    first = api.get("/api/v1/directory/states").json()
    assert len(first) == 51  # 50 states and DC; other jurisdictions are left out
    texas = next(s for s in first if s["state"] == "TX")
    assert texas == {"state": "TX", "name": "Texas", "carriers": 70000, "new_last_30_days": 702}
    assert next(s for s in first if s["state"] == "WY")["carriers"] == 0
    assert "add_date >= '20261005'" in census.queries[1]["$where"]

    api.get("/api/v1/directory/states")
    assert len(census.queries) == 2  # the second answer came from the cache


def test_state_carriers_sorted_and_without_contact_details(api: TestClient, census: FakeCensus):
    body = api.get("/api/v1/directory/states/ga?sort=largest&letter=b&page=1").json()
    query = census.queries[-1]
    assert "phy_state='GA'" in query["$where"]
    assert "starts_with(upper(legal_name), 'B')" in query["$where"]
    assert query["$order"].startswith("power_units::number DESC")
    assert query["$offset"] == "25"
    assert "phone" not in query["$select"] and "email" not in query["$select"]

    assert body["name"] == "Georgia" and body["letter"] == "B" and body["has_more"] is False
    new_big, old = body["carriers"]
    assert new_big["fleet_needs_check"] is True  # under 5 years old, 1,000+ units reported
    assert old["fleet_needs_check"] is False
    assert old["city"] == "Atlanta" and "phone" not in old


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/directory/states/ZZ",
        "/api/v1/directory/states/TX?sort=safest",
        "/api/v1/directory/states/TX?letter=1",
        "/api/v1/directory/states/TX?letter=AB",
    ],
)
def test_bad_input_never_reaches_the_query(api: TestClient, census: FakeCensus, path: str):
    assert api.get(path).status_code in (404, 422)
    assert census.queries == []


def test_needs_a_login(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            assert test_client.get("/api/v1/directory/states").status_code == 401
    finally:
        app.dependency_overrides.clear()
