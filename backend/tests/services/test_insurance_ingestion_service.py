"""Insurance filing ingestion (requires TEST_DATABASE_URL)."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError
from app.ingestion.insurance_filings import InsuranceFilingAdapter
from app.models import Insurance
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.insurance_ingestion_service import (
    InsuranceIngestionService,
    InsuranceIngestResult,
)
from tests.ingestion.helpers import FakeDotApi
from tests.services.fmcsa import FROZEN, fmcsa_api, load_census_authority_insurance

TODAY = date(2026, 10, 8)  # same as tests.services.fmcsa
MOTUS = ("inys-ebih", "yu5v-wbh6", "c5y8-a4uz", "3uet-3z4i")


@pytest.fixture
def api() -> FakeDotApi:
    return fmcsa_api()


def load(db: Session, api: FakeDotApi) -> InsuranceIngestResult:
    return load_census_authority_insurance(db, api)


def filings(db: Session) -> list[Insurance]:
    return list(db.scalars(select(Insurance).order_by(Insurance.effective_date, Insurance.id)))


def on_file(db: Session) -> list[Insurance]:
    return [f for f in filings(db) if f.on_file]


def test_carrier_must_be_loaded_first(db: Session, api: FakeDotApi) -> None:
    service = InsuranceIngestionService(
        db,
        InsuranceFilingAdapter(api.client()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        AuthorityRepository(db),
        InsuranceRepository(db),
        legacy_frozen_on=FROZEN,
    )
    with pytest.raises(CarrierNotFoundError):
        service.ingest(295017)


def test_motus_docket_uses_motus_current_filings_and_both_histories(
    db: Session, api: FakeDotApi
) -> None:
    result = load(db, api)

    current = on_file(db)
    assert (result.current_filings, result.past_filings) == (2, 10)
    assert {f.source_system for f in current} == {"MOTUS"}  # legacy current skipped
    bipd = next(f for f in current if f.insurance_type == "BIPD")
    assert (bipd.coverage_amount, bipd.status_as_of) == (Decimal("1000000.00"), TODAY)
    assert (bipd.docket_prefix.value if bipd.docket_prefix else None, bipd.docket_number) == (
        "MC",
        "139446",
    )
    assert len(filings(db)) == 12


def test_without_motus_legacy_current_filings_are_used_as_of_the_freeze(
    db: Session, api: FakeDotApi
) -> None:
    api.authority = {k: v for k, v in api.authority.items() if k not in MOTUS}

    load(db, api)

    current = on_file(db)
    assert len(current) == 2
    assert {(f.source_system, f.status_as_of) for f in current} == {("LEGACY_LI", FROZEN)}


def test_reingest_changes_nothing(db: Session, api: FakeDotApi) -> None:
    load(db, api)

    result = load(db, api)

    assert (result.added, result.no_longer_on_file) == (0, 0)
    assert len(filings(db)) == 12


def test_filing_that_leaves_the_current_list_is_kept(db: Session, api: FakeDotApi) -> None:
    load(db, api)
    api.authority["c5y8-a4uz"] = [
        r for r in api.authority["c5y8-a4uz"] if r["ins_type_code"] != "2"
    ]  # the cargo filing is gone

    result = load(db, api)

    assert result.no_longer_on_file == 1
    cargo = next(
        f
        for f in filings(db)
        if f.insurance_type == "CARGO" and f.policy_number == "CGV 3254702-17"
    )
    assert (cargo.on_file, cargo.status) == (False, "NO_LONGER_ON_FILE")
    assert len(on_file(db)) == 1


def test_same_past_filing_in_both_systems_is_stored_once(db: Session, api: FakeDotApi) -> None:
    legacy = api.authority["6sqe-dvqs"][0]  # TRU100515, cancelled 2003-04-17
    api.authority["3uet-3z4i"] = [
        {
            "docket_number": "MC139446",
            "usdot_number": "295017",
            "ins_form_code": "BMC-91X",
            "filing_status_reason": "CANCEL",
            "ins_type_code": "1",
            "policy_no": legacy["policy_no"],
            "ins_class_code": "P",
            "effective_date": "19880301",
            "max_cov_amount": "1000000.00",
            "cancl_effective_date": "20030417",
            "insurance_company_name": "Vanliner Insurance Company",
        }
    ]

    result = load(db, api)

    assert result.past_filings == 11  # 10 legacy + 1 Motus...
    assert len([f for f in filings(db) if f.policy_number == "TRU100515"]) == 1  # ...stored once
