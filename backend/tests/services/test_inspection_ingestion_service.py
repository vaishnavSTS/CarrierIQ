"""Inspection ingestion into raw_records and inspections (requires TEST_DATABASE_URL)."""

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, SourceFetchError
from app.models import IngestionRun, Inspection, RawRecord
from app.models.enums import IngestionStatus
from app.services.inspection_ingestion_service import (
    InspectionIngestResult,
    build_inspection_ingestion_service,
)
from tests.factories import make_carrier
from tests.ingestion.helpers import inspection_api, load_inspection_rows


def ingest(
    db: Session,
    headers: list[dict[str, Any]] | None = None,
    units: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> InspectionIngestResult:
    real_headers, real_units = load_inspection_rows()
    client = inspection_api(
        real_headers if headers is None else headers,
        real_units if units is None else units,
        **kwargs,
    )
    return build_inspection_ingestion_service(db, client).ingest(295017)


def inspections(db: Session) -> list[Inspection]:
    return list(db.scalars(select(Inspection).order_by(Inspection.inspection_id)))


def raw_count(db: Session, dataset_id: str) -> int:
    return len(db.scalars(select(RawRecord).where(RawRecord.dataset_id == dataset_id)).all())


def test_carrier_must_be_loaded_first(db: Session) -> None:
    with pytest.raises(CarrierNotFoundError):
        ingest(db)

    assert db.scalars(select(IngestionRun)).all() == []


def test_first_ingest_stores_raw_rows_and_inspections(db: Session) -> None:
    carrier = make_carrier(db, usdot_number=295017)

    result = ingest(db)

    assert (result.inspections_fetched, result.units_fetched, result.inspections_written) == (
        4,
        6,
        4,
    )
    assert raw_count(db, "fx4q-ay7w") == 4
    assert raw_count(db, "wt8s-2hbx") == 6
    assert result.header_run.status == IngestionStatus.SUCCEEDED
    assert result.unit_run is not None
    assert result.unit_run.status == IngestionStatus.SUCCEEDED

    rows = inspections(db)
    assert [(i.inspection_id, i.vin, i.vehicle_oos) for i in rows] == [
        ("82915718", "1FUBCXBS9DHFG2386", True),
        ("85796455", "JALB4B141Y7006238", False),
        ("86137641", "3ALACXFC1RDUW8608", False),
        ("87518319", "JALB4B141Y7006238", False),  # same vehicle, two inspections
    ]
    for inspection in rows:
        assert inspection.carrier_id == carrier.id
        assert inspection.source == "dot_socrata"
        raw = db.get_one(RawRecord, inspection.raw_record_id)
        assert raw.external_id == inspection.inspection_id


def test_unchanged_reingest_writes_nothing_new(db: Session) -> None:
    make_carrier(db, usdot_number=295017)
    ingest(db)

    result = ingest(db)

    assert result.inspections_written == 0
    assert raw_count(db, "fx4q-ay7w") == 4
    assert raw_count(db, "wt8s-2hbx") == 6
    assert len(inspections(db)) == 4


def test_corrected_header_updates_the_inspection(db: Session) -> None:
    make_carrier(db, usdot_number=295017)
    ingest(db)
    headers, _ = load_inspection_rows()
    headers[1] = {**headers[1], "driver_oos_total": "1", "change_date": "20261001 1200"}

    result = ingest(db, headers=headers)

    assert result.inspections_written == 1
    assert raw_count(db, "fx4q-ay7w") == 5  # the original row is kept
    corrected = next(i for i in inspections(db) if i.inspection_id == "85796455")
    assert corrected.driver_oos is True


def test_changed_unit_vin_updates_its_inspection(db: Session) -> None:
    make_carrier(db, usdot_number=295017)
    ingest(db)
    _, units = load_inspection_rows()
    units = [
        {**u, "insp_unit_vehicle_id_number": "1HGCM82633A004352"}
        if u["inspection_id"] == "86137641" and u["insp_unit_number"] == "1"
        else u
        for u in units
    ]

    result = ingest(db, units=units)

    assert result.inspections_written == 1
    updated = next(i for i in inspections(db) if i.inspection_id == "86137641")
    assert updated.vin == "1HGCM82633A004352"


def test_carrier_without_inspections(db: Session) -> None:
    make_carrier(db, usdot_number=295017)

    result = ingest(db, headers=[])

    assert result.unit_run is None
    assert result.header_run.status == IngestionStatus.SUCCEEDED
    assert result.header_run.records_fetched == 0
    assert inspections(db) == []


def test_unit_fetch_failure_fails_both_runs_and_stores_nothing(db: Session) -> None:
    make_carrier(db, usdot_number=295017)

    with pytest.raises(SourceFetchError):
        ingest(db, fail_units=True)

    runs = list(db.scalars(select(IngestionRun).order_by(IngestionRun.id)))
    assert [r.status for r in runs] == [IngestionStatus.FAILED, IngestionStatus.FAILED]
    assert runs[0].error_message is not None
    assert "Unit fetch failed" in runs[0].error_message
    assert db.scalars(select(RawRecord)).all() == []
    assert inspections(db) == []
