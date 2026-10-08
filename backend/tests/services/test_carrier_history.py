"""Carrier attribute history and snapshots (requires TEST_DATABASE_URL, except the first test)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import normalize_census_row
from app.models import CarrierAttributeHistory, CarrierSnapshot
from app.services.census_ingestion_service import (
    CensusIngestResult,
    build_census_ingestion_service,
)
from app.services.census_normalization_service import history_values
from tests.ingestion.helpers import load_census_rows, responding_with


def ingest(db: Session, **overrides: Any) -> CensusIngestResult:
    row = {**load_census_rows()[0], **overrides}
    row = {k: v for k, v in row.items() if v is not None}
    return build_census_ingestion_service(db, responding_with([row])).ingest(295017)


def history(db: Session, attribute: str | None = None) -> list[CarrierAttributeHistory]:
    query = select(CarrierAttributeHistory).order_by(CarrierAttributeHistory.id)
    if attribute:
        query = query.where(CarrierAttributeHistory.attribute == attribute)
    return list(db.scalars(query))


def snapshots(db: Session) -> list[CarrierSnapshot]:
    return list(db.scalars(select(CarrierSnapshot).order_by(CarrierSnapshot.id)))


def test_history_values_are_text() -> None:
    values = history_values(normalize_census_row(load_census_rows()[0]).carrier)

    assert values["legal_name"] == "UNITED MOVING AND STORAGE INC"
    assert values["fleet_size"] == "18"
    assert values["last_mcs150_date"] == "2025-05-28"
    assert values["dba_name"] is None
    assert "usdot_number" not in values  # identity, not a tracked attribute


def test_first_load_opens_a_row_per_attribute_with_a_value_and_takes_a_snapshot(
    db: Session,
) -> None:
    result = ingest(db)

    rows = history(db)
    expected = {
        name
        for name, value in history_values(
            normalize_census_row(load_census_rows()[0]).carrier
        ).items()
        if value is not None
    }
    assert {r.attribute for r in rows} == expected
    assert set(result.changed_attributes) == expected
    today = datetime.now(UTC).date()
    assert raw_id_of(result) is not None
    for row in rows:
        assert row.valid_from == today
        assert row.valid_to is None
        assert row.raw_record_id == raw_id_of(result)

    (snapshot,) = snapshots(db)
    assert result.raw_record is not None
    assert snapshot.data_hash == result.raw_record.payload_hash
    assert snapshot.snapshot_date == today


def test_unchanged_record_adds_no_history_and_no_snapshot(db: Session) -> None:
    ingest(db)
    before = len(history(db))

    result = ingest(db)

    assert result.changed_attributes == ()
    assert len(history(db)) == before
    assert len(snapshots(db)) == 1


def test_changed_value_closes_the_old_row_and_opens_a_new_one(db: Session) -> None:
    ingest(db)

    result = ingest(db, legal_name="UNITED MOVING & STORAGE LLC")

    assert result.changed_attributes == ("legal_name",)
    old, new = history(db, "legal_name")
    today = datetime.now(UTC).date()
    assert (old.value, old.valid_to) == ("UNITED MOVING AND STORAGE INC", today)
    assert (new.value, new.valid_from, new.valid_to) == ("UNITED MOVING & STORAGE LLC", today, None)
    assert new.raw_record_id == raw_id_of(result)
    assert len(snapshots(db)) == 2


def test_value_that_becomes_empty_is_recorded(db: Session) -> None:
    ingest(db, dba_name="UNITED MOVERS")

    ingest(db)  # dba_name no longer in the source record

    first, second = history(db, "dba_name")
    assert first.value == "UNITED MOVERS"
    assert first.valid_to is not None
    assert second.value is None
    assert second.valid_to is None


def test_change_outside_tracked_attributes_snapshots_without_history(db: Session) -> None:
    ingest(db)
    before = len(history(db))

    result = ingest(db, fax="3605550100")

    assert result.changed is True
    assert result.changed_attributes == ()
    assert len(history(db)) == before
    assert len(snapshots(db)) == 2


def test_point_in_time_lookup_uses_the_open_row(db: Session) -> None:
    ingest(db)
    ingest(db, power_units="25")

    current = db.scalars(
        select(CarrierAttributeHistory.value).where(
            CarrierAttributeHistory.attribute == "fleet_size",
            CarrierAttributeHistory.valid_to.is_(None),
        )
    ).one()

    assert current == "25"


def raw_id_of(result: CensusIngestResult) -> int | None:
    return result.raw_record.id if result.raw_record else None
