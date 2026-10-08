"""Carrier profile service and endpoint (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.core.exceptions import CarrierNotFoundError
from app.db.session import get_db
from app.main import app
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.timeline_repository import TimelineRepository
from app.services.carrier_profile_service import CarrierProfileService
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows
from tests.services.test_carrier_search import UNITED, Clock, census_row, refresh_service


@pytest.fixture
def api() -> FakeDotApi:
    headers, units = load_inspection_rows()
    return FakeDotApi([UNITED], headers, units)


def profile_service(
    db: Session, api: FakeDotApi, clock: Clock | None = None
) -> CarrierProfileService:
    return CarrierProfileService(
        refresh_service(db, api, clock),
        ObservedValueRepository(db),
        AuthorityRepository(db),
        InspectionRepository(db),
        CarrierHistoryRepository(db),
        InsuranceRepository(db),
        TimelineRepository(db),
    )


def test_profile_of_a_real_carrier(db: Session, api: FakeDotApi) -> None:
    profile = profile_service(db, api).get(295017)

    # Identity
    assert profile.legal_name == "UNITED MOVING AND STORAGE INC"
    assert profile.registration_status == "ACTIVE"
    assert profile.stale is False
    assert [(a.address_type, a.street, a.city) for a in profile.addresses] == [
        ("PHYSICAL", "1770 NE FUSON RD", "BREMERTON"),
        ("MAILING", "1770 NE FUSON RD", "BREMERTON"),
    ]
    assert [(p.phone_type, p.number) for p in profile.phones] == [
        ("OFFICE", "3604794800"),
        ("FAX", "3603732751"),
    ]
    assert profile.officers == ["SHAUNA WASHBURN", "CRAIG LOIDHAMER"]
    assert profile.domains == ["united-moving.com"]

    # Authority & insurance
    assert profile.authority.status == "ACTIVE"
    assert [(d.prefix, d.number) for d in profile.authority.dockets] == [("MC", "139446")]
    assert profile.insurance.status is None  # no FMCSA authority data in this fake API

    # Safety: 4 inspections, one vehicle out-of-service (82915718, 2024-10-14)
    safety = profile.safety
    assert (safety.inspection_count, safety.vehicle_oos_count, safety.driver_oos_count) == (4, 1, 0)
    assert (safety.vehicle_oos_rate, safety.driver_oos_rate) == (0.25, 0.0)
    assert (safety.first_inspection_date, safety.last_inspection_date) == (
        date(2024, 10, 14),
        date(2026, 4, 3),
    )
    assert [(y.year, y.inspections, y.vehicle_oos) for y in safety.by_year] == [
        (2024, 1, 1),
        (2025, 2, 0),
        (2026, 1, 0),
    ]
    assert [i.inspection_id for i in safety.recent_inspections] == [
        "87518319",
        "86137641",
        "85796455",
        "82915718",
    ]
    assert safety.recent_inspections[-1].violations == 3
    assert safety.crash_count is None

    # Equipment: three distinct power-unit VINs; the Isuzu appears on two inspections
    equipment = profile.equipment
    assert equipment.power_units == 18
    assert equipment.observed_vehicle_count == 3
    isuzu = next(v for v in equipment.vehicles if v.vin == "JALB4B141Y7006238")
    assert (isuzu.inspections, isuzu.first_seen, isuzu.last_seen) == (
        2,
        date(2025, 9, 5),
        date(2026, 4, 3),
    )
    assert equipment.vehicles[0].vin == "JALB4B141Y7006238"  # most recently seen first

    # The first load is not a change
    assert profile.recent_changes == []


def test_recent_changes_show_before_and_after(db: Session, api: FakeDotApi) -> None:
    clock = Clock()
    service = profile_service(db, api, clock)
    service.get(295017)
    api.census = [census_row(legal_name="UNITED MOVING & STORAGE LLC", power_units="25")]
    clock.current += timedelta(hours=25)

    profile = service.get(295017)

    assert [(c.attribute, c.old_value, c.new_value) for c in profile.recent_changes] == [
        ("legal_name", "UNITED MOVING AND STORAGE INC", "UNITED MOVING & STORAGE LLC"),
        ("fleet_size", "18", "25"),
    ]


def test_unknown_carrier_raises_not_found(db: Session, api: FakeDotApi) -> None:
    with pytest.raises(CarrierNotFoundError):
        profile_service(db, api).get(999999)


@pytest.fixture
def api_client(db: Session, api: FakeDotApi) -> Iterator[TestClient]:
    def fake_client() -> Iterator[Any]:
        yield api.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_profile_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/295017")

    assert response.status_code == 200
    body = response.json()
    assert body["usdot_number"] == 295017
    assert body["safety"]["inspection_count"] == 4
    assert body["equipment"]["observed_vehicle_count"] == 3


def test_profile_endpoint_unknown_carrier_is_404(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/999999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "carrier_not_found"


@pytest.mark.parametrize("bad", ["0", "abc", "123456789"])
def test_profile_endpoint_rejects_invalid_usdot(api_client: TestClient, bad: str) -> None:
    assert api_client.get(f"/api/v1/carriers/{bad}").status_code == 422


def test_search_route_is_not_mistaken_for_a_usdot(api_client: TestClient) -> None:
    assert api_client.get("/api/v1/carriers/search", params={"q": "295017"}).status_code == 200
