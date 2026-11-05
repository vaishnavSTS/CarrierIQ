"""The carrier map API: state totals and a state's carriers, from a fake census (no network):
public (no login, 10 a state) and in the carrier and insurance agent portals (every carrier)."""

from collections.abc import Iterator
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.api.v1.routes.directory import get_carrier_directory
from app.main import app
from app.models.enums import UserRole
from app.services import carrier_directory
from app.services.carrier_directory import CarrierDirectory

BASE = "/api/v1/public/directory"
PORTAL = "/api/v1/directory"


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
                "phy_state": "GA",
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
    body = api.get(f"{BASE}/states/ga?sort=az&letter=b").json()
    query = census.queries[-1]
    assert "phy_state='GA'" in query["$where"]
    assert "starts_with(upper(legal_name), 'B')" in query["$where"]
    assert query["$order"].startswith("legal_name")
    assert query["$offset"] == "0"
    assert "phone" not in query["$select"] and "email" not in query["$select"]

    assert body["name"] == "Georgia" and body["letter"] == "B" and body["has_more"] is False
    new_big, old = body["carriers"]
    assert set(new_big) == {
        "usdot_number", "legal_name", "city", "power_units", "registered_on", "fleet_needs_check",
        "rated_on",
    }  # fmt: skip
    assert new_big["fleet_needs_check"] is True  # under 5 years old, 1,000+ units reported
    assert old["fleet_needs_check"] is False
    assert old["city"] == "Atlanta"


def test_public_lists_show_only_ten():
    census = FakeCensus(rows=26)
    client = _client(census)
    api = next(client)
    try:
        body = api.get(f"{BASE}/states/TX?sort=largest").json()
        assert len(body["carriers"]) == 10 and body["has_more"] is True
        assert census.queries[-1]["$limit"] == "11"
        api.get(f"{BASE}/states/TX?page=2")  # no paging: always the first ten
        assert census.queries[-1]["$offset"] == "0"
    finally:
        next(client, None)


def _as(role: UserRole) -> None:
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=role)


@pytest.mark.parametrize(
    "role", [UserRole.CLIENT_USER, UserRole.INSURANCE_AGENT, UserRole.STS_ANALYST]
)
def test_the_portal_map_lists_every_carrier(role: UserRole):
    census = FakeCensus(rows=26)
    client = _client(census)
    api = next(client)
    try:
        _as(role)
        assert len(api.get(f"{PORTAL}/states").json()) == 51
        first = api.get(f"{PORTAL}/states/TX").json()
        assert len(first["carriers"]) == 25 and first["has_more"] is True
        api.get(f"{PORTAL}/states/TX?sort=az&page=40")
        assert census.queries[-1]["$offset"] == "1000"  # far past the public list
    finally:
        next(client, None)


def test_portal_lists_new_this_month_and_satisfactory_ratings(api: TestClient, census: FakeCensus):
    _as(UserRole.INSURANCE_AGENT)
    api.get(f"{PORTAL}/states/TX?sort=new")
    assert "add_date >= '20261005'" in census.queries[-1]["$where"]
    assert census.queries[-1]["$order"].startswith("add_date DESC")

    census.rows = 2
    api.get(f"{PORTAL}/states/TX?sort=rated")
    query = census.queries[-1]
    assert "safety_rating='S'" in query["$where"]
    assert query["$order"].startswith("safety_rating_date DESC")


def test_rating_date_only_for_a_satisfactory_rating():
    directory = CarrierDirectory(FakeCensus(), today=lambda: date(2026, 11, 4))  # type: ignore[arg-type]
    rated = directory._carrier(
        {
            "dot_number": "5",
            "legal_name": "A",
            "safety_rating": "S",
            "safety_rating_date": "20240115",
        }
    )
    conditional = directory._carrier(
        {
            "dot_number": "6",
            "legal_name": "B",
            "safety_rating": "C",
            "safety_rating_date": "20240115",
        }
    )
    assert rated is not None and rated.rated_on == date(2024, 1, 15)
    assert conditional is not None and conditional.rated_on is None


@pytest.mark.parametrize("sort", ["new", "rated"])
def test_public_lists_keep_three_sorts(api: TestClient, census: FakeCensus, sort: str):
    assert api.get(f"{BASE}/states/TX?sort={sort}").status_code == 422
    assert census.queries == []


@pytest.mark.parametrize("role", [UserRole.BROKER_USER, UserRole.BROKER_ADMIN])
def test_brokers_have_no_portal_map(api: TestClient, census: FakeCensus, role: UserRole):
    _as(role)
    assert api.get(f"{PORTAL}/states/TX").status_code == 403
    assert census.queries == []


def test_the_portal_map_needs_a_login(api: TestClient):
    assert api.get(f"{PORTAL}/states").status_code == 401


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


def test_inactive_carriers_and_totals(api: TestClient, census: FakeCensus):
    api.get(f"{BASE}/states?status=inactive")
    assert census.queries[0]["$where"].startswith("status_code='I' AND carrier_operation='A'")
    api.get(f"{BASE}/states")  # active totals are cached apart from inactive ones
    assert census.queries[-1]["$where"].startswith("status_code='A'")

    body = api.get(f"{BASE}/states/TX?status=inactive&sort=largest").json()
    assert body["status"] == "inactive"
    assert census.queries[-1]["$where"].startswith("status_code='I'")
    assert api.get(f"{BASE}/states/TX?status=revoked").status_code == 422


def test_recent_registrations_nationwide_and_cached(api: TestClient, census: FakeCensus):
    census.rows = 2
    first = api.get(f"{BASE}/recent").json()
    query = census.queries[-1]
    assert query["$order"].startswith("add_date DESC")
    assert "phy_state" not in query["$where"]  # every state
    assert "phone" not in query["$select"]
    assert first[0]["legal_name"] == "BIG NEW FLEET LLC" and "state" in first[0]
    api.get(f"{BASE}/recent")
    assert len(census.queries) == 1  # the second answer came from the cache
