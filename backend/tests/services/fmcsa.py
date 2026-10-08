"""Shared setup: a fake FMCSA API with real data for USDOT 295017, loaded in refresh order."""

from datetime import date

from sqlalchemy.orm import Session

from app.ingestion.insurance_filings import InsuranceFilingAdapter
from app.ingestion.operating_authority import OperatingAuthorityAdapter
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.authority_ingestion_service import AuthorityIngestionService
from app.services.census_ingestion_service import build_census_ingestion_service
from app.services.insurance_ingestion_service import (
    InsuranceIngestionService,
    InsuranceIngestResult,
)
from tests.ingestion.helpers import (
    FakeDotApi,
    load_authority_rows,
    load_census_rows,
    load_insurance_rows,
)

TODAY = date(2026, 10, 8)
FROZEN = date(2026, 5, 14)


def fmcsa_api() -> FakeDotApi:
    return FakeDotApi(
        load_census_rows(), authority={**load_authority_rows(), **load_insurance_rows()}
    )


def load_census_authority_insurance(db: Session, api: FakeDotApi) -> InsuranceIngestResult:
    """Census, then authority, then insurance - the refresh order."""
    build_census_ingestion_service(db, api.client()).ingest(295017)
    common = (IngestionRunRepository(db), RawRecordRepository(db), CarrierRepository(db))
    AuthorityIngestionService(
        db,
        OperatingAuthorityAdapter(api.client()),
        *common,
        AuthorityRepository(db),
        AuthorityHistoryRepository(db),
        legacy_frozen_on=FROZEN,
        today=TODAY,
    ).ingest(295017)
    return InsuranceIngestionService(
        db,
        InsuranceFilingAdapter(api.client()),
        *common,
        AuthorityRepository(db),
        InsuranceRepository(db),
        legacy_frozen_on=FROZEN,
        today=TODAY,
    ).ingest(295017)
