"""Every census fetch is recorded in ingestion_runs (requires TEST_DATABASE_URL)."""

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError, ValidationError
from app.ingestion.company_census import CompanyCensusAdapter
from app.models import IngestionRun
from app.models.enums import IngestionStatus
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.services.census_ingestion_service import CensusIngestionService
from tests.ingestion.helpers import load_census_rows, responding_with


def service(db: Session, body: Any, status_code: int = 200) -> CensusIngestionService:
    adapter = CompanyCensusAdapter(responding_with(body, status_code))
    return CensusIngestionService(db, adapter, IngestionRunRepository(db))


def test_successful_fetch_is_recorded(db: Session) -> None:
    result = service(db, load_census_rows()).fetch(295017)

    assert result.row is not None
    assert result.row["dot_number"] == "295017"
    run = db.get_one(IngestionRun, result.run.id)
    assert run.status == IngestionStatus.SUCCEEDED
    assert run.source == "dot_socrata"
    assert run.dataset_id == "az4n-8mr2"
    assert run.query == "dot_number=295017"
    assert run.records_fetched == 1
    assert run.finished_at is not None
    assert run.error_message is None


def test_carrier_not_in_source_is_a_successful_run_with_no_records(db: Session) -> None:
    result = service(db, []).fetch(999999999)

    assert result.row is None
    assert result.run.status == IngestionStatus.SUCCEEDED
    assert result.run.records_fetched == 0


def test_failed_fetch_is_recorded_and_reraised(db: Session) -> None:
    with pytest.raises(SourceFetchError):
        service(db, {"message": "down"}, status_code=503).fetch(295017)

    run = db.scalars(select(IngestionRun)).one()
    assert run.status == IngestionStatus.FAILED
    assert run.error_message is not None
    assert "HTTP 503" in run.error_message
    assert run.finished_at is not None


def test_invalid_usdot_creates_no_run(db: Session) -> None:
    with pytest.raises(ValidationError):
        service(db, []).fetch(0)

    assert db.scalars(select(IngestionRun)).all() == []
