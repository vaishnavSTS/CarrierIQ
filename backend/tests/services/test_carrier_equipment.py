"""Equipment endpoint: decoded VINs, shared VINs and fleet (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.db.session import get_db
from app.main import app
from app.schemas.carrier_equipment import EquipmentVehicleOut
from app.services.carrier_equipment_service import summarize_fleet
from tests.factories import make_carrier
from tests.ingestion.helpers import FakeDotApi
from tests.services.test_shared_vin_service import FREIGHTLINER, ISUZU, api  # noqa: F401


@pytest.fixture
def api_client(db: Session, api: FakeDotApi) -> Iterator[TestClient]:  # noqa: F811
    def fake_client() -> Iterator[Any]:
        yield api.client()

    make_carrier(db, usdot_number=777, legal_name="SEVEN SEVEN SEVEN LLC")  # 888 isn't loaded
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_equipment_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/api/v1/carriers/295017/equipment")

    assert response.status_code == 200
    body = response.json()
    vehicles = {v["vin"]: v for v in body["vehicles"]}
    assert len(vehicles) == 5
    last_seen = [v["last_seen"] for v in body["vehicles"]]
    assert last_seen == sorted(last_seen, reverse=True)  # most recently seen first

    tractor = vehicles[FREIGHTLINER]
    assert tractor["decoded"] is True  # decoded during the refresh (saved vPIC answers)
    assert (tractor["make"], tractor["model"], tractor["year"]) == ("FREIGHTLINER", "M2", 2013)
    assert tractor["check_digit_valid"] is True
    assert tractor["other_carriers"] == [
        {
            "usdot_number": 777,
            "legal_name": "SEVEN SEVEN SEVEN LLC",
            "inspections": 1,
            "first_seen": "2022-01-10",
            "last_seen": "2022-01-10",
            "confidence": "MEDIUM",
        }
    ]
    (isuzu_other,) = vehicles[ISUZU]["other_carriers"]
    assert (isuzu_other["usdot_number"], isuzu_other["legal_name"]) == (888, None)
    assert (isuzu_other["inspections"], isuzu_other["confidence"]) == (2, "HIGH")
    assert (body["shared_vin_count"], body["other_carrier_count"]) == (2, 2)
    assert body["invalid_check_digit_count"] == 0

    fleet = body["fleet"]
    assert fleet["registered_power_units"] is not None
    assert (fleet["observed_vehicles"], fleet["observed_power_units"]) == (5, 3)
    assert (fleet["observed_trailers"], fleet["observed_unknown_type"]) == (2, 0)
    assert fleet["first_observed"] <= fleet["last_observed"]


def test_unknown_carrier_is_404(api_client: TestClient) -> None:
    assert api_client.get("/api/v1/carriers/999999/equipment").status_code == 404


def row(vin: str, vehicle_type: str | None, last_seen: date) -> EquipmentVehicleOut:
    return EquipmentVehicleOut(
        vin=vin,
        inspections=1,
        first_seen=last_seen,
        last_seen=last_seen,
        decoded=vehicle_type is not None,
        make=None,
        model=None,
        year=None,
        body_class=None,
        vehicle_type=vehicle_type,
        gvwr=None,
        check_digit_valid=None,
        other_carriers=[],
    )


def test_fleet_counts_recent_power_units_only() -> None:
    fleet = summarize_fleet(
        25,
        [
            row("A", "TRUCK", date(2026, 1, 1)),
            row("B", "TRUCK", date(2023, 1, 1)),  # older than 24 months
            row("C", "Trailer", date(2026, 1, 1)),
            row("D", None, date(2026, 1, 1)),  # not decoded yet
        ],
        date(2026, 10, 8),
    )

    assert (fleet.registered_power_units, fleet.observed_vehicles) == (25, 4)
    assert (fleet.observed_power_units, fleet.recent_power_units) == (2, 1)
    assert (fleet.observed_trailers, fleet.observed_unknown_type) == (1, 1)
    assert (fleet.first_observed, fleet.last_observed) == (date(2023, 1, 1), date(2026, 1, 1))
