"""Shared VINs across carriers (requires TEST_DATABASE_URL)."""

from datetime import date
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IngestionRun, Relationship, Vehicle
from app.models.enums import Confidence, IngestionStatus
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from app.services.shared_vin_service import build_shared_vin_service
from tests.factories import make_carrier
from tests.ingestion.helpers import FakeDotApi, load_census_rows, load_inspection_rows

ISUZU = "JALB4B141Y7006238"  # on two of USDOT 295017's inspections
FREIGHTLINER = "1FUBCXBS9DHFG2386"


def other(
    inspection_id: str, dot: str, day: str, vin: str, unit_id: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """A header + unit for another carrier's inspection that carries `vin`."""
    header = {
        "inspection_id": inspection_id,
        "dot_number": dot,
        "insp_date": day,
        "report_state": "TX",
    }
    unit = {
        "inspection_id": inspection_id,
        "insp_unit_id": unit_id,
        "insp_unit_number": "1",
        "insp_unit_vehicle_id_number": vin,
    }
    return header, unit


@pytest.fixture
def api() -> FakeDotApi:
    headers, units = load_inspection_rows()
    extra = [
        other("90000001", "888", "20230501", ISUZU, "990001"),
        other("90000002", "888", "20230601", ISUZU, "990002"),
        other("90000003", "777", "20220110", FREIGHTLINER, "990003"),
        # Own inspection the carrier's inspection fetch didn't return (padded USDOT here, so the
        # fake by-USDOT lookup misses it): must not become a link to "another" carrier.
        other("90000004", "0295017", "20260901", FREIGHTLINER, "990004"),
    ]
    return FakeDotApi(
        load_census_rows(), headers + [h for h, _ in extra], units + [u for _, u in extra]
    )


def links_for(db: Session, usdot: int) -> dict[str, Relationship]:
    vins = {v.id: v.vin for v in db.scalars(select(Vehicle))}
    rows = db.scalars(select(Relationship).where(Relationship.target_entity_id == usdot))
    return {vins[r.source_entity_id]: r for r in rows}


def run(db: Session, api: FakeDotApi) -> Any:
    make_carrier(db, usdot_number=295017)
    build_inspection_ingestion_service(db, api.client()).ingest(295017)
    return build_shared_vin_service(db, api.client()).ingest(295017)


def test_vins_on_other_carriers_inspections_are_linked(db: Session, api: FakeDotApi) -> None:
    result = run(db, api)

    assert (result.vins_checked, result.other_carriers, result.shared_vins) == (5, 2, 2)
    isuzu = links_for(db, 888)[ISUZU]
    assert (isuzu.first_seen, isuzu.last_seen, isuzu.observation_count) == (
        date(2023, 5, 1),
        date(2023, 6, 1),
        2,
    )
    assert isuzu.confidence == Confidence.HIGH  # 2+ inspections under the other USDOT
    freightliner = links_for(db, 777)[FREIGHTLINER]
    assert freightliner.confidence == Confidence.MEDIUM  # one inspection
    assert freightliner.raw_record_id is not None  # traced to the unit row


def test_own_inspections_are_not_shared(db: Session, api: FakeDotApi) -> None:
    run(db, api)

    # 90000004 belongs to 295017 itself: no "other carrier" link is made for it.
    assert set(links_for(db, 295017)) == {
        ISUZU,
        FREIGHTLINER,
        "1KKVE4823RL099385",
        "3ALACXFC1RDUW8608",
        "4P5T82224D1195316",
    }
    assert links_for(db, 295017)[FREIGHTLINER].observation_count == 1


def test_runs_are_recorded_and_rerun_is_stable(db: Session, api: FakeDotApi) -> None:
    run(db, api)
    service = build_shared_vin_service(db, api.client())

    service.ingest(295017)

    assert len(db.scalars(select(Relationship)).all()) == 5 + 2
    assert service.last_refreshed_at(295017) is not None
    shared_runs = [
        r for r in db.scalars(select(IngestionRun)) if r.query and "shared VINs" in r.query
    ]
    assert shared_runs and all(r.status == IngestionStatus.SUCCEEDED for r in shared_runs)


def test_carrier_without_vins(db: Session, api: FakeDotApi) -> None:
    make_carrier(db, usdot_number=295017)

    result = build_shared_vin_service(db, api.client()).ingest(295017)

    assert (result.vins_checked, result.other_carriers) == (0, 0)
