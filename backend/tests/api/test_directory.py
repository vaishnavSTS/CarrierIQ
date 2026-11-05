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
        if params.get("$group") == "phy_cnty":
            if "add_date >=" in params["$where"]:
                return [{"phy_cnty": "201", "n": "38"}]
            return [
                {"phy_cnty": "113", "n": "2100"},
                {"phy_cnty": "201", "n": "4120"},
                {"phy_cnty": None, "n": "7"},  # no county on file: left out
                {"phy_cnty": "2O1", "n": "1"},  # not a county code: left out
            ]
        if params.get("$where", "").startswith("dot_number="):
            if params["$where"] != "dot_number='4382997'":
                return []
            return [
                {
                    "dot_number": "4382997",
                    "legal_name": "BIG NEW FLEET LLC ",
                    "dba_name": "BNF",
                    "status_code": "A",
                    "docket1prefix": "MC",
                    "docket1": "1270630",
                    "phone": "(559) 344-7968",
                    "cell_phone": "0000000000",
                    "email_address": "Dispatch@BNF.example ",
                    "phy_street": "838 ROSAZZO LN",
                    "phy_city": "MANTECA",
                    "phy_state": "CA",
                    "phy_zip": "95337",
                    "carrier_mailing_street": "PO BOX 12",
                    "carrier_mailing_city": "MANTECA",
                    "carrier_mailing_state": "CA",
                    "carrier_mailing_zip": "95336",
                    "power_units": "4",
                    "total_drivers": "5",
                    "add_date": "20210628",
                }
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


def _as(role: UserRole, user_id: int = 1) -> None:
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=role, id=user_id)


@pytest.mark.parametrize(
    "role", [UserRole.BROKER_USER, UserRole.INSURANCE_AGENT, UserRole.STS_ANALYST]
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


@pytest.mark.parametrize("sort", ["new", "rated", "hazmat"])
def test_public_lists_keep_three_sorts(api: TestClient, census: FakeCensus, sort: str):
    assert api.get(f"{BASE}/states/TX?sort={sort}").status_code == 422
    assert census.queries == []


@pytest.mark.parametrize("role", [UserRole.BROKER_USER, UserRole.BROKER_ADMIN])
def test_brokers_have_the_portal_map(api: TestClient, census: FakeCensus, role: UserRole):
    _as(role)
    assert api.get(f"{PORTAL}/states/TX").status_code == 200
    assert api.get(f"{PORTAL}/states/TX/counties").status_code == 200
    assert api.get(f"{PORTAL}/carriers/4382997").json()["phone"] == "5593447968"


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


def test_county_counts_most_first_and_cached(api: TestClient, census: FakeCensus):
    body = api.get(f"{BASE}/states/tx/counties").json()
    assert body == [
        {"county": "201", "carriers": 4120, "new_last_30_days": 38},
        {"county": "113", "carriers": 2100, "new_last_30_days": 0},
    ]
    assert "phy_state='TX'" in census.queries[0]["$where"]
    assert "add_date >= '20261005'" in census.queries[1]["$where"]
    api.get(f"{BASE}/states/TX/counties")
    assert len(census.queries) == 2  # the second answer came from the cache

    api.get(f"{BASE}/states/TX/counties?status=inactive")  # cached apart from active
    assert census.queries[-1]["$where"].startswith("status_code='I'")


def test_a_county_narrows_the_list(api: TestClient, census: FakeCensus):
    body = api.get(f"{BASE}/states/TX?county=201&sort=largest").json()
    assert "phy_state='TX' AND phy_cnty='201'" in census.queries[-1]["$where"]
    assert body["county"] == "201" and len(body["carriers"]) <= 10

    _as(UserRole.BROKER_USER)
    api.get(f"{PORTAL}/states/TX?county=201&sort=new&page=3")
    query = census.queries[-1]
    assert "phy_cnty='201'" in query["$where"] and query["$offset"] == "75"
    assert api.get(f"{PORTAL}/states/TX/counties").status_code == 200


@pytest.mark.parametrize(
    "path",
    [
        f"{BASE}/states/TX?county=20",
        f"{BASE}/states/TX?county=2011",
        f"{BASE}/states/TX?county=20%27",
        f"{BASE}/states/TX?county=abc",
        f"{BASE}/states/ZZ/counties",
    ],
)
def test_bad_counties_never_reach_the_query(api: TestClient, census: FakeCensus, path: str):
    assert api.get(path).status_code in (404, 422)
    assert census.queries == []


def test_contact_card_for_a_clicked_carrier(api: TestClient, census: FakeCensus):
    _as(UserRole.INSURANCE_AGENT)
    card = api.get(f"{PORTAL}/carriers/4382997").json()
    assert card == {
        "usdot_number": 4382997,
        "legal_name": "BIG NEW FLEET LLC",
        "dba_name": "BNF",
        "status": "ACTIVE",
        "mc_number": "MC1270630",
        "phone": "5593447968",
        "cell_phone": None,  # all zeros: no number
        "email": "dispatch@bnf.example",
        "address": "838 ROSAZZO LN, MANTECA, CA 95337",
        "mailing_address": "PO BOX 12, MANTECA, CA 95336",
        "power_units": 4,
        "drivers": 5,
        "registered_on": "2021-06-28",
    }
    assert census.queries[-1]["$where"] == "dot_number='4382997'"
    assert api.get(f"{PORTAL}/carriers/123").status_code == 404


def test_contact_cards_are_not_public(api: TestClient, census: FakeCensus):
    assert api.get(f"{PORTAL}/carriers/4382997").status_code == 401
    assert api.get(f"{BASE}/carriers/4382997").status_code == 404  # no public route
    _as(UserRole.CLIENT_USER)  # carriers have no map at all
    assert api.get(f"{PORTAL}/carriers/4382997").status_code == 403
    assert census.queries == []


def test_contact_cards_are_limited_per_user(
    api: TestClient, census: FakeCensus, monkeypatch: pytest.MonkeyPatch
):
    from app.api.v1.routes import directory
    from app.core.config import get_settings
    from app.core.rate_limit import limiter

    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    monkeypatch.setattr(directory, "CONTACT_CARDS_PER_USER", (2, 3600.0))
    limiter.reset()
    try:
        _as(UserRole.BROKER_USER, user_id=7)
        assert api.get(f"{PORTAL}/carriers/4382997").status_code == 200
        assert api.get(f"{PORTAL}/carriers/4382997").status_code == 200
        assert api.get(f"{PORTAL}/carriers/4382997").status_code == 429
        _as(UserRole.BROKER_USER, user_id=8)  # someone else still can
        assert api.get(f"{PORTAL}/carriers/4382997").status_code == 200
    finally:
        limiter.reset()


@pytest.mark.parametrize("path", [f"{PORTAL}/carriers/0", f"{PORTAL}/carriers/abc"])
def test_bad_usdot_never_reaches_the_query(api: TestClient, census: FakeCensus, path: str):
    _as(UserRole.BROKER_USER)
    assert api.get(path).status_code == 422
    assert census.queries == []


@pytest.mark.parametrize("role", [UserRole.CLIENT_USER, UserRole.CLIENT_ADMIN])
def test_carriers_have_no_portal_map(api: TestClient, census: FakeCensus, role: UserRole):
    _as(role)
    assert api.get(f"{PORTAL}/states").status_code == 403
    assert api.get(f"{PORTAL}/states/TX").status_code == 403
    assert api.get(f"{PORTAL}/states/TX/counties").status_code == 403
    assert census.queries == []


def test_portal_lists_hazmat_carriers(api: TestClient, census: FakeCensus):
    _as(UserRole.BROKER_USER)
    assert api.get(f"{PORTAL}/states/TX?sort=hazmat&county=201").status_code == 200
    query = census.queries[-1]
    assert "hm_ind='Y'" in query["$where"] and "phy_cnty='201'" in query["$where"]
    assert query["$order"].startswith("add_date DESC")
    api.get(f"{PORTAL}/states/TX?sort=hazmat&status=inactive")
    assert census.queries[-1]["$where"].startswith("status_code='I'")
