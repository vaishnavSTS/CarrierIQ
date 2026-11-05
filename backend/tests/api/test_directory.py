"""The public carrier map API: state totals and a state's carriers, from a fake census (no
network), with no login."""

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routes.directory import get_carrier_directory
from app.main import app
from app.services import carrier_directory
from app.services.carrier_directory import CarrierDirectory

BASE = "/api/v1/public/directory"


class FakeCensus:
    """Answers like the Socrata client, and records each query."""

    def __init__(self, rows: int = 2) -> None:
        self.rows = rows
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
        if self.rows > 2:
            return [
                {"dot_number": str(1000 + i), "legal_name": f"CARRIER {i}",
                 "power_units": "2", "add_date": "20260101"}
                for i in range(self.rows)
            ]  # fmt: skip
        return [
            {
                "dot_number": "4382997",
                "legal_name": "BIG NEW FLEET LLC",
                "dba_name": "BNF",
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


def _client(census: FakeCensus) -> Iterator[TestClient]:
    carrier_directory.clear_cache()
    app.dependency_overrides[get_carrier_directory] = lambda: CarrierDirectory(
        census,  # type: ignore[arg-type]
        today=lambda: date(2026, 11, 4),
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    carrier_directory.clear_cache()


@pytest.fixture
def api(census: FakeCensus) -> Iterator[TestClient]:
    yield from _client(census)


def test_state_counts_need_no_login_and_are_cached(api: TestClient, census: FakeCensus):
    first = api.get(f"{BASE}/states").json()
    assert len(first) == 51  # 50 states and DC; other jurisdictions are left out
    texas = next(s for s in first if s["state"] == "TX")
    assert texas == {"state": "TX", "name": "Texas", "carriers": 70000, "new_last_30_days": 702}
    assert next(s for s in first if s["state"] == "WY")["carriers"] == 0
    assert "add_date >= '20261005'" in census.queries[1]["$where"]

    api.get(f"{BASE}/states")
    assert len(census.queries) == 2  # the second answer came from the cache


def test_state_carriers_sorted_and_without_contact_details(api: TestClient, census: FakeCensus):
    body = api.get(f"{BASE}/states/ga?sort=az&letter=b&page=1").json()
    query = census.queries[-1]
    assert "phy_state='GA'" in query["$where"]
    assert "starts_with(upper(legal_name), 'B')" in query["$where"]
    assert query["$order"].startswith("legal_name")
    assert query["$offset"] == "25"
    assert "phone" not in query["$select"] and "email" not in query["$select"]

    assert body["name"] == "Georgia" and body["letter"] == "B" and body["has_more"] is False
    new_big, old = body["carriers"]
    assert set(new_big) == {
        "usdot_number", "legal_name", "city", "power_units", "registered_on", "fleet_needs_check",
    }  # fmt: skip
    assert new_big["fleet_needs_check"] is True  # under 5 years old, 1,000+ units reported
    assert old["fleet_needs_check"] is False
    assert old["city"] == "Atlanta"


def test_only_the_first_pages_can_be_read():
    census = FakeCensus(rows=26)  # more than a page
    client = _client(census)
    api = next(client)
    try:
        assert api.get(f"{BASE}/states/TX?sort=largest").json()["has_more"] is True
        last = api.get(f"{BASE}/states/TX?sort=largest&page=2").json()
        assert last["has_more"] is False  # the last page anyone can open
        assert api.get(f"{BASE}/states/TX?page=3").status_code == 422
    finally:
        next(client, None)


@pytest.mark.parametrize(
    "path",
    [
        f"{BASE}/states/ZZ",
        f"{BASE}/states/TX?sort=safest",
        f"{BASE}/states/TX?letter=1",
        f"{BASE}/states/TX?letter=AB",
    ],
)
def test_bad_input_never_reaches_the_query(api: TestClient, census: FakeCensus, path: str):
    assert api.get(path).status_code in (404, 422)
    assert census.queries == []


def test_the_logged_in_map_is_gone(api: TestClient):
    assert api.get("/api/v1/directory/states").status_code == 404
