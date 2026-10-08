"""VIN extraction and VIN -> carrier links (requires TEST_DATABASE_URL)."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Relationship, Vehicle
from app.models.enums import Confidence
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from app.services.vehicle_observation_service import build_vehicle_observation_service
from tests.factories import make_carrier
from tests.ingestion.helpers import inspection_api, load_inspection_rows, load_violation_rows


def load(db: Session) -> None:
    headers, units = load_inspection_rows()
    client = inspection_api(headers, units, violations=load_violation_rows())
    build_inspection_ingestion_service(db, client).ingest(295017)


def links(db: Session) -> dict[str, Relationship]:
    vins = {v.id: v.vin for v in db.scalars(select(Vehicle))}
    return {vins[r.source_entity_id]: r for r in db.scalars(select(Relationship))}


def test_every_vin_on_the_carriers_inspections_is_linked(db: Session) -> None:
    carrier = make_carrier(db, usdot_number=295017)
    load(db)

    count = build_vehicle_observation_service(db).rebuild_own(carrier)

    by_vin = links(db)
    assert count == len(by_vin) == 5  # 3 power units + 2 trailers
    assert {"1KKVE4823RL099385", "4P5T82224D1195316"} <= by_vin.keys()  # trailers included
    isuzu = by_vin["JALB4B141Y7006238"]
    assert (isuzu.target_entity_type, isuzu.target_entity_id) == ("usdot", 295017)
    assert (isuzu.first_seen, isuzu.last_seen, isuzu.observation_count) == (
        date(2025, 9, 5),
        date(2026, 4, 3),
        2,
    )
    assert isuzu.confidence == Confidence.HIGH
    assert by_vin["1FUBCXBS9DHFG2386"].confidence == Confidence.MEDIUM  # one inspection
    assert all(r.raw_record_id is not None for r in by_vin.values())


def test_rebuild_is_idempotent(db: Session) -> None:
    carrier = make_carrier(db, usdot_number=295017)
    load(db)
    service = build_vehicle_observation_service(db)
    service.rebuild_own(carrier)

    service.rebuild_own(carrier)

    assert len(db.scalars(select(Relationship)).all()) == 5
    assert len(db.scalars(select(Vehicle)).all()) == 5


def test_carrier_without_inspections_has_no_vins(db: Session) -> None:
    carrier = make_carrier(db, usdot_number=295017)

    assert build_vehicle_observation_service(db).rebuild_own(carrier) == 0
