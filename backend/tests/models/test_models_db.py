"""Model behaviour against a real PostgreSQL database (requires TEST_DATABASE_URL)."""

from datetime import date

import pytest
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Address,
    Authority,
    CarrierAttributeHistory,
    IdentityEvent,
    Inspection,
    IntelligenceSignal,
    Relationship,
    SignalEvidence,
)
from app.models.enums import (
    AddressType,
    Confidence,
    DocketPrefix,
    Severity,
    SignalStatus,
)
from tests.factories import make_carrier, make_raw_record


def test_carrier_with_source_traced_children(db: Session) -> None:
    raw = make_raw_record(db)
    carrier = make_carrier(db)
    db.add_all(
        [
            Address(
                carrier_id=carrier.id,
                address_type=AddressType.PHYSICAL,
                street="123 MAIN ST",
                city="DALLAS",
                state="TX",
                first_seen=date(2026, 1, 1),
                last_seen=date(2026, 10, 1),
                source=raw.source,
                raw_record_id=raw.id,
            ),
            Authority(
                carrier_id=carrier.id,
                docket_prefix=DocketPrefix.MC,
                docket_number="0012345",
                source=raw.source,
                raw_record_id=raw.id,
            ),
            Inspection(
                inspection_id="TX123",
                carrier_id=carrier.id,
                vin="1FUJGLDR5CLBP8834",
                inspection_date=date(2026, 5, 2),
                vehicle_oos=True,
                source=raw.source,
                raw_record_id=raw.id,
            ),
        ]
    )
    db.flush()

    address = db.scalars(select(Address).where(Address.carrier_id == carrier.id)).one()
    assert address.is_current is True
    assert address.undeliverable is False
    authority = db.scalars(select(Authority).where(Authority.docket_number == "0012345")).one()
    assert authority.carrier_id == carrier.id  # leading zeros preserved
    inspection = db.scalars(select(Inspection)).one()
    assert inspection.vehicle_oos is True
    assert inspection.driver_oos is False


def test_usdot_number_is_unique(db: Session) -> None:
    make_carrier(db, usdot_number=111)
    with pytest.raises(IntegrityError):
        make_carrier(db, usdot_number=111, legal_name="ANOTHER CARRIER")


def test_only_one_current_value_per_attribute(db: Session) -> None:
    raw = make_raw_record(db)
    carrier = make_carrier(db)

    def history(value: str, valid_from: date) -> CarrierAttributeHistory:
        return CarrierAttributeHistory(
            carrier_id=carrier.id,
            attribute="legal_name",
            value=value,
            valid_from=valid_from,
            source=raw.source,
            raw_record_id=raw.id,
        )

    db.add(history("ACME TRUCKING LLC", date(2025, 1, 1)))
    db.flush()
    db.add(history("ACME LOGISTICS LLC", date(2026, 5, 15)))
    with pytest.raises(IntegrityError):
        db.flush()


def test_history_period_cannot_end_before_it_starts(db: Session) -> None:
    raw = make_raw_record(db)
    carrier = make_carrier(db)
    db.add(
        CarrierAttributeHistory(
            carrier_id=carrier.id,
            attribute="email",
            value="ops@example.com",
            valid_from=date(2026, 5, 1),
            valid_to=date(2026, 4, 1),
            source=raw.source,
            raw_record_id=raw.id,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_point_in_time_lookup(db: Session) -> None:
    """Spec 11.3: what did this carrier look like on date X?"""
    raw = make_raw_record(db)
    carrier = make_carrier(db)
    db.add_all(
        [
            CarrierAttributeHistory(
                carrier_id=carrier.id,
                attribute="legal_name",
                value="ACME TRUCKING LLC",
                valid_from=date(2025, 1, 1),
                valid_to=date(2026, 5, 15),
                source=raw.source,
                raw_record_id=raw.id,
            ),
            CarrierAttributeHistory(
                carrier_id=carrier.id,
                attribute="legal_name",
                value="ACME LOGISTICS LLC",
                valid_from=date(2026, 5, 15),
                source=raw.source,
                raw_record_id=raw.id,
            ),
        ]
    )
    db.flush()

    def legal_name_on(day: date) -> str | None:
        return db.scalars(
            select(CarrierAttributeHistory.value).where(
                CarrierAttributeHistory.carrier_id == carrier.id,
                CarrierAttributeHistory.attribute == "legal_name",
                CarrierAttributeHistory.valid_from <= day,
                or_(
                    CarrierAttributeHistory.valid_to.is_(None),
                    CarrierAttributeHistory.valid_to > day,
                ),
            )
        ).one_or_none()

    assert legal_name_on(date(2024, 12, 31)) is None
    assert legal_name_on(date(2026, 1, 1)) == "ACME TRUCKING LLC"
    assert legal_name_on(date(2026, 5, 15)) == "ACME LOGISTICS LLC"


def test_unknown_confidence_value_is_rejected_by_the_database(db: Session) -> None:
    carrier = make_carrier(db)
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO intelligence_signals "
                "(carrier_id, signal_type, rule_id, rule_version, severity, title, confidence) "
                "VALUES (:carrier_id, 'SHARED_VIN', 'shared_vin', '1.0', 'HIGH', 't', 'CERTAIN')"
            ),
            {"carrier_id": carrier.id},
        )


def test_signal_defaults_to_open_and_deleting_it_removes_its_evidence(db: Session) -> None:
    raw = make_raw_record(db)
    carrier = make_carrier(db)
    signal = IntelligenceSignal(
        carrier_id=carrier.id,
        signal_type="SHARED_VIN",
        rule_id="shared_vin",
        rule_version="1.0",
        severity=Severity.MEDIUM,
        title="Potential shared VIN",
        confidence=Confidence.HIGH,
    )
    db.add(signal)
    db.flush()
    db.add(
        SignalEvidence(
            signal_id=signal.id,
            evidence_type="RECORD",
            entity_type="inspection",
            entity_id=1,
            raw_record_id=raw.id,
            field_name="vin",
            observed_value="1FUJGLDR5CLBP8834",
            source=raw.source,
        )
    )
    db.flush()
    assert signal.status == SignalStatus.OPEN

    db.delete(signal)
    db.flush()
    assert db.scalars(select(SignalEvidence)).all() == []


def test_relationship_link_is_unique(db: Session) -> None:
    def link() -> Relationship:
        return Relationship(
            source_entity_type="vehicle",
            source_entity_id=1,
            relationship_type="VIN_OBSERVED_WITH",
            target_entity_type="carrier",
            target_entity_id=2,
            first_seen=date(2026, 1, 1),
            last_seen=date(2026, 1, 1),
            confidence=Confidence.MEDIUM,
        )

    db.add(link())
    db.flush()
    assert db.scalars(select(Relationship.observation_count)).one() == 1
    db.add(link())
    with pytest.raises(IntegrityError):
        db.flush()


def test_identity_correction_keeps_the_original_event(db: Session) -> None:
    carrier = make_carrier(db)
    original = IdentityEvent(
        carrier_id=carrier.id,
        event_type="OWNERSHIP_CHANGE_ATTESTED",
        event_date=date(2026, 3, 1),
    )
    db.add(original)
    db.flush()
    correction = IdentityEvent(
        carrier_id=carrier.id,
        event_type="OWNERSHIP_CHANGE_CORRECTED",
        event_date=date(2026, 3, 10),
        corrects_event_id=original.id,
    )
    db.add(correction)
    db.flush()

    events = db.scalars(select(IdentityEvent).order_by(IdentityEvent.id)).all()
    assert [e.event_type for e in events] == [
        "OWNERSHIP_CHANGE_ATTESTED",
        "OWNERSHIP_CHANGE_CORRECTED",
    ]
    assert events[1].corrects_event_id == original.id
    assert original.source == "manual"


def test_fuzzy_name_search_finds_misspelled_carrier(db: Session) -> None:
    make_carrier(db, usdot_number=1, legal_name="ACME TRUCKING LLC")
    make_carrier(db, usdot_number=2, legal_name="BLUE RIVER FREIGHT INC")

    matches = db.scalars(
        text("SELECT legal_name FROM carriers WHERE legal_name % :q"),
        {"q": "ACME TRUCKIN"},
    ).all()

    assert matches == ["ACME TRUCKING LLC"]
