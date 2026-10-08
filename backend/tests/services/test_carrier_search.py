"""On-demand refresh, search service and search API (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import build_refresh_service, get_socrata_client
from app.core.exceptions import SourceFetchError
from app.db.session import get_db
from app.ingestion.company_census import CompanyCensusAdapter
from app.main import app
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.carrier_search_service import CarrierSearchService
from app.services.census_ingestion_service import build_census_ingestion_service
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from tests.ingestion.helpers import FakeDotApi, load_census_rows, load_inspection_rows


def census_row(**overrides: Any) -> dict[str, Any]:
    row = {**load_census_rows()[0], **overrides}
    return {k: v for k, v in row.items() if v is not None}


UNITED = census_row()  # USDOT 295017, MC139446
# A second carrier sharing MC139446 in its second docket slot, as seen on the live API.
SISTER = census_row(
    dot_number="3212670",
    legal_name="UNITED MOVING SERVICES LLC",
    docket1prefix="MC",
    docket1="1000511",
    docket2prefix="MC",
    docket2="139446",
    docket2_status_code="I",
)
OTHER = census_row(dot_number="777", legal_name="BLUE RIVER FREIGHT INC", docket1="555")


@pytest.fixture
def api() -> FakeDotApi:
    headers, units = load_inspection_rows()
    return FakeDotApi([UNITED, SISTER, OTHER], headers, units)


class Clock:
    def __init__(self) -> None:
        self.current = datetime.now(UTC)

    def __call__(self) -> datetime:
        return self.current


def refresh_service(
    db: Session, api: FakeDotApi, clock: Clock | None = None
) -> CarrierRefreshService:
    client = api.client()
    return CarrierRefreshService(
        CarrierRepository(db),
        build_census_ingestion_service(db, client),
        build_inspection_ingestion_service(db, client),
        max_age=timedelta(hours=24),
        now=clock or Clock(),
    )


def search_service(db: Session, api: FakeDotApi) -> CarrierSearchService:
    return CarrierSearchService(
        CompanyCensusAdapter(api.client()),
        refresh_service(db, api),
        CarrierRepository(db),
        AuthorityRepository(db),
        ObservedValueRepository(db),
        name_limit=20,
        docket_limit=10,
    )


# --- on-demand refresh ---


def test_missing_carrier_is_loaded_with_its_inspections(db: Session, api: FakeDotApi) -> None:
    outcome = refresh_service(db, api).ensure_fresh(295017)

    assert outcome.carrier is not None
    assert outcome.carrier.legal_name == "UNITED MOVING AND STORAGE INC"
    assert (outcome.refreshed, outcome.stale) == (True, False)
    assert api.calls == {"az4n-8mr2": 1, "fx4q-ay7w": 1, "wt8s-2hbx": 1}


def test_fresh_carrier_is_served_without_calling_the_source(db: Session, api: FakeDotApi) -> None:
    clock = Clock()
    service = refresh_service(db, api, clock)
    service.ensure_fresh(295017)
    api.calls.clear()

    clock.current += timedelta(hours=23)
    outcome = service.ensure_fresh(295017)

    assert (outcome.refreshed, outcome.stale) == (False, False)
    assert api.calls == {}


def test_carrier_older_than_the_limit_is_refetched(db: Session, api: FakeDotApi) -> None:
    clock = Clock()
    service = refresh_service(db, api, clock)
    service.ensure_fresh(295017)
    api.calls.clear()

    clock.current += timedelta(hours=25)
    outcome = service.ensure_fresh(295017)

    assert outcome.refreshed is True
    assert api.calls["az4n-8mr2"] == 1


def test_source_failure_serves_stored_data_marked_stale(db: Session, api: FakeDotApi) -> None:
    clock = Clock()
    service = refresh_service(db, api, clock)
    service.ensure_fresh(295017)
    clock.current += timedelta(days=2)
    api.down = True

    outcome = service.ensure_fresh(295017)

    assert outcome.carrier is not None
    assert outcome.carrier.legal_name == "UNITED MOVING AND STORAGE INC"
    assert (outcome.refreshed, outcome.stale) == (False, True)


def test_source_failure_for_an_unknown_carrier_raises(db: Session, api: FakeDotApi) -> None:
    api.down = True

    with pytest.raises(SourceFetchError):
        refresh_service(db, api).ensure_fresh(295017)


def test_carrier_not_in_the_source(db: Session, api: FakeDotApi) -> None:
    outcome = refresh_service(db, api).ensure_fresh(999999)

    assert outcome.carrier is None
    assert api.calls == {"az4n-8mr2": 1}  # no inspection fetch for a carrier that doesn't exist


# --- search service ---


def test_usdot_search_loads_and_describes_the_carrier(db: Session, api: FakeDotApi) -> None:
    response = search_service(db, api).search("USDOT 295017")

    assert response.query_type == "usdot"
    (result,) = response.results
    assert result.usdot_number == 295017
    assert result.legal_name == "UNITED MOVING AND STORAGE INC"
    assert [(d.prefix, d.number, d.status) for d in result.dockets] == [("MC", "139446", "ACTIVE")]
    assert result.authority_status == "ACTIVE"
    assert (result.city, result.state) == ("BREMERTON", "WA")
    assert result.fleet_size == 18
    assert result.loaded is True
    assert result.last_refreshed_at is not None
    assert result.insurance_status is None  # Phase 6


def test_docket_search_returns_every_carrier_holding_the_docket(
    db: Session, api: FakeDotApi
) -> None:
    response = search_service(db, api).search("MC 139446")

    assert response.query_type == "docket"
    assert [r.usdot_number for r in response.results] == [295017, 3212670]
    assert all(r.loaded for r in response.results)
    sister = response.results[1]
    assert sister.authority_status == "ACTIVE"  # one of its two dockets is active


def test_name_search_lists_loaded_carriers_first_then_live_matches(
    db: Session, api: FakeDotApi
) -> None:
    service = search_service(db, api)
    service.search("3212670")  # load the sister carrier only

    response = service.search("united moving")

    assert response.query_type == "name"
    assert [(r.usdot_number, r.loaded) for r in response.results] == [
        (3212670, True),
        (295017, False),  # live match, not saved
    ]
    assert CarrierRepository(db).get_by_usdot(295017) is None


def test_unknown_usdot_returns_no_results(db: Session, api: FakeDotApi) -> None:
    assert search_service(db, api).search("999999").results == []


# --- API ---


@pytest.fixture
def api_client(db: Session, api: FakeDotApi) -> Iterator[TestClient]:
    def fake_client() -> Iterator[Any]:
        yield api.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_search_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/search", params={"q": "MC139446"})

    assert response.status_code == 200
    body = response.json()
    assert body["query_type"] == "docket"
    assert [r["usdot_number"] for r in body["results"]] == [295017, 3212670]


def test_search_endpoint_rejects_unusable_queries(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/search", params={"q": "ab"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_refresh_service_builder_uses_the_configured_age(db: Session, api: FakeDotApi) -> None:
    assert build_refresh_service(db, api.client()).max_age == timedelta(hours=24)


def test_name_search_puts_names_starting_with_the_query_first(db: Session) -> None:
    rows = [
        census_row(dot_number="11", legal_name="ALL UNITED MOVING LLC", docket1="11"),
        census_row(dot_number="22", legal_name="UNITED MOVING EXPERTS LLC", docket1="22"),
    ]
    api = FakeDotApi(rows)

    response = search_service(db, api).search("united moving")

    assert [r.usdot_number for r in response.results] == [22, 11]
    assert api.calls["az4n-8mr2"] == 2  # starts-with pass, then contains pass


def test_fresh_census_but_missing_inspections_fetches_only_inspections(
    db: Session, api: FakeDotApi
) -> None:
    """Regression: a carrier loaded by census alone used to count as fully fresh."""
    build_census_ingestion_service(db, api.client()).ingest(295017)
    api.calls.clear()

    outcome = refresh_service(db, api).ensure_fresh(295017)

    assert outcome.refreshed is True
    assert "az4n-8mr2" not in api.calls  # census still fresh: not refetched
    assert api.calls["fx4q-ay7w"] == 1


def test_failed_inspection_fetch_is_retried_on_the_next_request(
    db: Session, api: FakeDotApi
) -> None:
    api.failing = {"fx4q-ay7w"}  # the inspection source is down
    service = refresh_service(db, api)

    first = service.ensure_fresh(295017)
    assert first.carrier is not None  # census succeeded, so the carrier is still served
    assert first.stale is True

    api.failing = set()
    api.calls.clear()
    second = service.ensure_fresh(295017)

    assert (second.refreshed, second.stale) == (True, False)
    assert "az4n-8mr2" not in api.calls  # only the inspections are retried
    assert api.calls["fx4q-ay7w"] == 1
