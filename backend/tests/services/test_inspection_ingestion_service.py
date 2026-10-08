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
from tests.ingestion.helpers import inspection_api, load_inspection_rows, load_violation_rows


def ingest(
    db: Session,
    headers: list[dict[str, Any]] | None = None,
    units: list[dict[str, Any]] | None = None,
    violations: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> InspectionIngestResult:
    real_headers, real_units = load_inspection_rows()
    client = inspection_api(
        real_headers if headers is None else headers,
        real_units if units is None else units,
        violations=load_violation_rows() if violations is None else violations,
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
    assert "Fetch failed in run" in runs[0].error_message
    assert db.scalars(select(RawRecord)).all() == []
    assert inspections(db) == []


def test_violations_are_stored_and_attached_to_their_inspection(db: Session) -> None:
    make_carrier(db, usdot_number=295017)

    result = ingest(db)

    assert result.violations_fetched == 9
    assert result.violation_run is not None
    assert result.violation_run.status == IngestionStatus.SUCCEEDED
    assert raw_count(db, "876r-jsdb") == 9
    by_id = {i.inspection_id: i for i in inspections(db)}
    for inspection in by_id.values():
        assert inspection.violation_data is not None
        # The header's violation count matches the violation rows for every real inspection.
        assert (
            len(inspection.violation_data["violations"]) == inspection.violation_data["viol_total"]
        )
    first = by_id["82915718"].violation_data
    assert first is not None
    assert [(v["code"], v["applies_to"], v["out_of_service"]) for v in first["violations"]] == [
        ("393.95A4-EEUS", "VEHICLE", False),
        ("392.16B-DPASS", "DRIVER", False),
        ("393.9A-LTSI", "VEHICLE", True),  # the out-of-service violation on the trailer
    ]


def test_changed_violation_rewrites_its_inspection(db: Session) -> None:
    make_carrier(db, usdot_number=295017)
    ingest(db)
    violations = [
        {**v, "out_of_service_indicator": "Y"} if v["inspection_id"] == "87518319" else v
        for v in load_violation_rows()
    ]

    result = ingest(db, violations=violations)

    assert result.inspections_written == 1
    assert raw_count(db, "876r-jsdb") == 10  # the original row is kept
    updated = next(i for i in inspections(db) if i.inspection_id == "87518319")
    assert updated.violation_data is not None
    assert updated.violation_data["violations"][0]["out_of_service"] is True


def test_violation_fetch_failure_fails_every_run_and_stores_nothing(db: Session) -> None:
    make_carrier(db, usdot_number=295017)

    with pytest.raises(SourceFetchError):
        ingest(db, fail_violations=True)

    runs = list(db.scalars(select(IngestionRun).order_by(IngestionRun.id)))
    assert [r.dataset_id for r in runs] == ["fx4q-ay7w", "wt8s-2hbx", "876r-jsdb"]
    assert all(r.status == IngestionStatus.FAILED for r in runs)
    assert db.scalars(select(RawRecord)).all() == []


def test_inspection_stored_in_an_older_format_is_upgraded(db: Session) -> None:
    """Regression: inspections without violations kept the pre-violations format because only
    changed source rows triggered a rewrite."""
    make_carrier(db, usdot_number=295017)
    ingest(db)
    old = next(i for i in inspections(db) if i.inspection_id == "85796455")
    assert old.violation_data is not None
    old.violation_data = {k: v for k, v in old.violation_data.items() if k != "violations"}
    db.flush()

    result = ingest(db)  # the source rows are unchanged

    assert result.inspections_written == 1
    upgraded = next(i for i in inspections(db) if i.inspection_id == "85796455")
    assert upgraded.violation_data is not None
    assert len(upgraded.violation_data["violations"]) == 1
