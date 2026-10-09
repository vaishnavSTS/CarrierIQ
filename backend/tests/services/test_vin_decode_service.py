"""VIN decoding for a carrier's vehicles (requires TEST_DATABASE_URL)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IngestionRun, RawRecord, Vehicle
from app.models.enums import IngestionStatus
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from app.services.vehicle_observation_service import build_vehicle_observation_service
from app.services.vin_decode_service import build_vin_decode_service
from tests.factories import make_carrier
from tests.ingestion.helpers import inspection_api, load_inspection_rows
from tests.ingestion.test_vpic import fake_vpic


def carrier_with_vins(db: Session):  # type: ignore[no-untyped-def]
    carrier = make_carrier(db, usdot_number=295017)
    headers, units = load_inspection_rows()
    build_inspection_ingestion_service(db, inspection_api(headers, units)).ingest(295017)
    build_vehicle_observation_service(db).rebuild_own(carrier)
    return carrier


def vehicles(db: Session) -> dict[str, Vehicle]:
    return {v.vin: v for v in db.scalars(select(Vehicle))}


def test_vins_are_decoded_once_and_traced(db: Session) -> None:
    carrier = carrier_with_vins(db)
    calls: list[list[str]] = []

    decoded = build_vin_decode_service(db, fake_vpic(calls)).decode_for_carrier(carrier)

    assert decoded == 5
    tractor = vehicles(db)["1FUBCXBS9DHFG2386"]
    assert (tractor.decoded_make, tractor.decoded_year, tractor.check_digit_valid) == (
        "FREIGHTLINER",
        2013,
        True,
    )
    assert tractor.decoded_at is not None
    raw = db.get_one(RawRecord, tractor.decode_raw_record_id)
    assert (raw.source, raw.external_id) == ("nhtsa_vpic", "1FUBCXBS9DHFG2386")
    assert vehicles(db)["4P5T82224D1195316"].decoded_vehicle_type == "TRAILER"

    again = build_vin_decode_service(db, fake_vpic(calls)).decode_for_carrier(carrier)

    assert again == 0
    assert len(calls) == 1  # cached: the second run sent nothing to vPIC


def test_vpic_outage_leaves_vehicles_for_the_next_refresh(db: Session) -> None:
    carrier = carrier_with_vins(db)

    decoded = build_vin_decode_service(db, fake_vpic(status=503)).decode_for_carrier(carrier)

    assert decoded == 0
    assert all(v.decoded_at is None for v in vehicles(db).values())
    run = db.scalars(select(IngestionRun).where(IngestionRun.source == "nhtsa_vpic")).one()
    assert run.status == IngestionStatus.FAILED
