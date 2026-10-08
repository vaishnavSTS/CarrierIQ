"""Census ingestion: run logging and raw storage (requires TEST_DATABASE_URL)."""

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError, ValidationError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.fingerprint import payload_hash
from app.models import IngestionRun, RawRecord
from app.models.enums import IngestionStatus
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.census_ingestion_service import CensusIngestionService
from tests.ingestion.helpers import load_census_rows, responding_with


def service(db: Session, body: Any, status_code: int = 200) -> CensusIngestionService:
    adapter = CompanyCensusAdapter(responding_with(body, status_code))
    return CensusIngestionService(db, adapter, IngestionRunRepository(db), RawRecordRepository(db))


def raw_records(db: Session) -> list[RawRecord]:
    return list(db.scalars(select(RawRecord).order_by(RawRecord.id)))


# --- run logging ---


def test_successful_fetch_is_recorded(db: Session) -> None:
    result = service(db, load_census_rows()).ingest(295017)

    run = db.get_one(IngestionRun, result.run.id)
    assert run.status == IngestionStatus.SUCCEEDED
    assert run.source == "dot_socrata"
    assert run.dataset_id == "az4n-8mr2"
    assert run.query == "dot_number=295017"
    assert run.records_fetched == 1
    assert run.finished_at is not None
    assert run.error_message is None


def test_carrier_not_in_source_is_a_successful_run_with_nothing_stored(db: Session) -> None:
    result = service(db, []).ingest(999999999)

    assert result.raw_record is None
    assert result.changed is False
    assert result.run.status == IngestionStatus.SUCCEEDED
    assert result.run.records_fetched == 0
    assert raw_records(db) == []


def test_failed_fetch_is_recorded_reraised_and_stores_nothing(db: Session) -> None:
    with pytest.raises(SourceFetchError):
        service(db, {"message": "down"}, status_code=503).ingest(295017)

    run = db.scalars(select(IngestionRun)).one()
    assert run.status == IngestionStatus.FAILED
    assert run.error_message is not None
    assert "HTTP 503" in run.error_message
    assert run.finished_at is not None
    assert raw_records(db) == []


def test_invalid_usdot_creates_no_run(db: Session) -> None:
    with pytest.raises(ValidationError):
        service(db, []).ingest(0)

    assert db.scalars(select(IngestionRun)).all() == []


# --- raw storage ---


def test_first_fetch_stores_the_row_exactly_as_received(db: Session) -> None:
    rows = load_census_rows()

    result = service(db, rows).ingest(295017)

    assert result.changed is True
    stored = raw_records(db)
    assert len(stored) == 1
    record = stored[0]
    assert record.payload == rows[0]
    assert record.payload_hash == payload_hash(rows[0])
    assert record.source == "dot_socrata"
    assert record.dataset_id == "az4n-8mr2"
    assert record.external_id == "295017"
    assert record.ingestion_run_id == result.run.id
    assert result.raw_record is not None
    assert result.raw_record.id == record.id


def test_unchanged_payload_is_a_recorded_check_not_a_new_row(db: Session) -> None:
    rows = load_census_rows()
    first = service(db, rows).ingest(295017)

    second = service(db, rows).ingest(295017)

    assert second.changed is False
    assert second.raw_record is not None
    assert first.raw_record is not None
    assert second.raw_record.id == first.raw_record.id
    assert len(raw_records(db)) == 1
    assert len(db.scalars(select(IngestionRun)).all()) == 2  # both checks are recorded


def test_changed_payload_is_stored_and_the_old_version_kept(db: Session) -> None:
    original = load_census_rows()[0]
    moved = {**original, "phy_street": "456 NEW STREET"}
    service(db, [original]).ingest(295017)

    result = service(db, [moved]).ingest(295017)

    assert result.changed is True
    stored = raw_records(db)
    assert [r.payload["phy_street"] for r in stored] == ["1770 NE FUSON RD", "456 NEW STREET"]
    assert result.raw_record is not None
    assert result.raw_record.id == stored[-1].id
