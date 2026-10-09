"""Identity change and fleet consistency signals (requires TEST_DATABASE_URL)."""

from datetime import date

from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import AddressValues, OfficerValues, PhoneValues
from app.intelligence.base_rule import RuleContext
from app.intelligence.rules.fleet_consistency import FleetConsistencyRule
from app.intelligence.rules.identity_change import IdentityChangeRule
from app.models import Address, Carrier, Officer, Phone
from app.models.enums import AddressType, Confidence, PhoneType, Severity
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from app.services.vehicle_observation_service import build_vehicle_observation_service
from app.services.vin_decode_service import build_vin_decode_service
from tests.factories import make_carrier, make_raw_record
from tests.ingestion.helpers import inspection_api, load_inspection_rows
from tests.ingestion.test_vpic import fake_vpic

FIRST = date(2025, 3, 1)
SECOND = date(2026, 2, 1)
TODAY = date(2026, 10, 8)
# legal name, street, office phone, officer
OLD = ("ACME LLC", "1 MAIN ST", "2065550100", "JO DOE")
NEW = ("ZENITH LLC", "9 PINE ST", "2065550199", "AL ROE")


def census(
    db: Session,
    carrier: Carrier,
    day: date,
    values: tuple[str, str, str, str],
) -> None:
    """What the census normalizer stores for one fetch of the carrier's record."""
    name, street, phone, officer = values
    raw = make_raw_record(db, external_id=f"{carrier.usdot_number}-{day}").id
    trace = {"source": "dot_socrata", "raw_record_id": raw}
    CarrierHistoryRepository(db).record_changes(
        carrier.id, {"legal_name": name, "email": "ops@acme.test"}, observed_on=day, **trace
    )
    observed = ObservedValueRepository(db)
    address = AddressValues(
        AddressType.PHYSICAL, street, "SEATTLE", "WA", "98101", None, "US", False
    )
    observed.sync(Address, carrier.id, [address], seen_on=day, **trace)
    observed.sync(Phone, carrier.id, [PhoneValues(PhoneType.OFFICE, phone)], seen_on=day, **trace)
    observed.sync(Officer, carrier.id, [OfficerValues(officer, officer)], seen_on=day, **trace)


def evaluate(db: Session, carrier: Carrier, today: date = TODAY):  # type: ignore[no-untyped-def]
    return {s.signal_key: s for s in IdentityChangeRule().evaluate(RuleContext(db, carrier, today))}


def test_first_load_is_not_a_change(db: Session) -> None:
    carrier = make_carrier(db)
    census(db, carrier, FIRST, OLD)

    assert evaluate(db, carrier) == {}


def test_changes_show_before_and_after(db: Session) -> None:
    carrier = make_carrier(db)
    census(db, carrier, FIRST, OLD)
    census(db, carrier, SECOND, NEW)

    found = evaluate(db, carrier)

    assert set(found) == {
        "identity_change:legal_name:2026-02-01",
        "identity_change:address:PHYSICAL:2026-02-01",
        "identity_change:phone:OFFICE:2026-02-01",
        "identity_change:officers:2026-02-01",
    }  # the unchanged email is not a signal
    name = found["identity_change:legal_name:2026-02-01"]
    assert (name.severity, name.confidence) == (Severity.MEDIUM, Confidence.HIGH)
    assert "from ACME LLC to ZENITH LLC" in name.description
    assert [e.observed_value for e in name.evidence] == [
        "Before: ACME LLC, from 2025-03-01 to 2026-02-01",
        "After: ZENITH LLC, from 2026-02-01 (current)",
    ]
    address = found["identity_change:address:PHYSICAL:2026-02-01"]
    assert (
        "from 1 MAIN ST, SEATTLE, WA 98101 to 9 PINE ST, SEATTLE, WA 98101" in address.description
    )
    assert [e.entity_type for e in address.evidence] == ["address", "address"]
    phone = found["identity_change:phone:OFFICE:2026-02-01"]
    assert "(206) 555-0100" in phone.description and "(206) 555-0199" in phone.description
    assert all(e.raw_record_id is not None for s in found.values() for e in s.evidence)


def test_old_changes_are_history(db: Session) -> None:
    carrier = make_carrier(db)
    census(db, carrier, FIRST, OLD)
    census(db, carrier, SECOND, NEW)

    assert evaluate(db, carrier, today=date(2029, 1, 1)) == {}


# --- fleet consistency: USDOT 295017 has 3 power units (+2 trailers) on recent inspections ---


def fleet_carrier(db: Session, registered: int) -> Carrier:
    make_carrier(db, usdot_number=295017)
    headers, units = load_inspection_rows()
    build_inspection_ingestion_service(db, inspection_api(headers, units)).ingest(295017)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None
    build_vehicle_observation_service(db).rebuild_own(carrier)
    build_vin_decode_service(db, fake_vpic()).decode_for_carrier(carrier)
    carrier.fleet_size = registered
    return carrier


def fleet(db: Session, carrier: Carrier):  # type: ignore[no-untyped-def]
    return FleetConsistencyRule().evaluate(RuleContext(db, carrier, TODAY))


def test_limited_inspection_coverage(db: Session) -> None:
    carrier = fleet_carrier(db, registered=18)

    (signal,) = fleet(db, carrier)

    assert signal.signal_key == "fleet_consistency:limited_coverage"
    assert (signal.severity, signal.confidence) == (Severity.LOW, Confidence.MEDIUM)
    assert "does not prove non-operation or misconduct" in signal.description
    assert [e.evidence_type for e in signal.evidence] == ["RECORD", "COMPARISON", "THRESHOLD"]
    assert signal.evidence[1].observed_value is not None
    assert signal.evidence[1].observed_value.startswith("3 power units seen")
    assert signal.evidence[2].observed_value is not None
    assert "(3 of 18 = 17%)" in signal.evidence[2].observed_value


def test_more_seen_than_registered(db: Session) -> None:
    (signal,) = fleet(db, fleet_carrier(db, registered=0))

    assert signal.signal_key == "fleet_consistency:more_than_registered"


def test_consistent_fleet_has_no_signal(db: Session) -> None:
    assert fleet(db, fleet_carrier(db, registered=4)) == []
