"""Operating-authority ingestion (requires TEST_DATABASE_URL)."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, SourceFetchError
from app.ingestion.operating_authority import OperatingAuthorityAdapter
from app.models import Authority, AuthorityHistory, IngestionRun
from app.models.enums import IngestionStatus
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.authority_ingestion_service import (
    AuthorityIngestionService,
    AuthorityIngestResult,
)
from app.services.census_ingestion_service import build_census_ingestion_service
from tests.ingestion.helpers import FakeDotApi, load_authority_rows, load_census_rows

TODAY = date(2026, 10, 8)
FROZEN = date(2026, 5, 14)


@pytest.fixture
def api() -> FakeDotApi:
    return FakeDotApi(load_census_rows(), authority=load_authority_rows())


def ingest(db: Session, api: FakeDotApi) -> AuthorityIngestResult:
    return AuthorityIngestionService(
        db,
        OperatingAuthorityAdapter(api.client()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        AuthorityRepository(db),
        AuthorityHistoryRepository(db),
        legacy_frozen_on=FROZEN,
        today=TODAY,
    ).ingest(295017)


def load_census(db: Session, api: FakeDotApi) -> None:
    build_census_ingestion_service(db, api.client()).ingest(295017)


def docket(db: Session) -> Authority:
    return db.scalars(select(Authority).where(Authority.docket_number == "139446")).one()


def history(db: Session) -> list[AuthorityHistory]:
    return list(db.scalars(select(AuthorityHistory).order_by(AuthorityHistory.action_date)))


def test_carrier_must_be_loaded_first(db: Session, api: FakeDotApi) -> None:
    with pytest.raises(CarrierNotFoundError):
        ingest(db, api)


def test_motus_sets_the_current_authority(db: Session, api: FakeDotApi) -> None:
    load_census(db, api)

    result = ingest(db, api)

    a = docket(db)
    assert a.authority_type == "Motor Carrier of Household Goods"
    assert (a.status, a.status_source, a.status_as_of) == ("ACTIVE", "MOTUS", TODAY)
    assert (a.bipd_required, a.bipd_on_file) == (Decimal("750000.00"), Decimal("1000000.00"))
    assert (a.cargo_required, a.cargo_on_file, a.bond_required) == (True, True, False)
    assert len(result.runs) == 4
    assert all(r.status == IngestionStatus.SUCCEEDED for r in result.runs)


def test_history_comes_from_both_systems(db: Session, api: FakeDotApi) -> None:
    load_census(db, api)

    result = ingest(db, api)

    events = history(db)
    assert result.events_added == len(events) == 6  # 5 legacy actions + 1 Motus status change
    revoked = next(e for e in events if e.action == "REVOKED")
    assert (revoked.action_date, revoked.source_system) == (date(2021, 6, 8), "LEGACY_LI")
    assert {e.source_system for e in events if e.action == "REINSTATED"} == {"LEGACY_LI", "MOTUS"}


def test_reingest_adds_nothing(db: Session, api: FakeDotApi) -> None:
    load_census(db, api)
    ingest(db, api)

    result = ingest(db, api)

    assert result.events_added == 0
    assert len(history(db)) == 6


def test_without_motus_legacy_supplies_the_authority_status(db: Session, api: FakeDotApi) -> None:
    api.authority = {k: v for k, v in api.authority.items() if k not in ("inys-ebih", "yu5v-wbh6")}
    load_census(db, api)
    assert (docket(db).status, docket(db).status_source) == ("ACTIVE", "CENSUS")

    ingest(db, api)

    a = docket(db)
    assert (a.status, a.status_source, a.status_as_of) == ("ACTIVE", "LEGACY_LI", FROZEN)
    assert a.authority_type == "Common carrier (Household goods)"
    assert a.bipd_on_file == Decimal("1000000.00")
    assert a.revocation_pending is False


def test_census_docket_status_never_overrides_authority_status(
    db: Session, api: FakeDotApi
) -> None:
    """Regression: the census shows docket status "A" for revoked authority (e.g. MC161790)."""
    api.authority = {k: v for k, v in api.authority.items() if k not in ("inys-ebih", "yu5v-wbh6")}
    legacy = api.authority["6eyk-hxee"][0]
    api.authority["6eyk-hxee"] = [{**legacy, "common_stat": "I"}]  # authority inactive
    load_census(db, api)  # census docket status: A
    ingest(db, api)

    load_census(db, api)  # a later census refresh still says A

    assert (docket(db).status, docket(db).status_source) == ("INACTIVE", "LEGACY_LI")


def test_census_refresh_does_not_overwrite_a_motus_status(db: Session, api: FakeDotApi) -> None:
    load_census(db, api)
    ingest(db, api)
    api.census = [{**load_census_rows()[0], "docket1_status_code": "I", "fax": "3605550100"}]

    load_census(db, api)

    assert (docket(db).status, docket(db).status_source) == ("ACTIVE", "MOTUS")


def test_docket_only_in_authority_data_is_added(db: Session, api: FakeDotApi) -> None:
    api.census = [{k: v for k, v in load_census_rows()[0].items() if not k.startswith("docket1")}]
    load_census(db, api)

    ingest(db, api)

    assert docket(db).status_source == "MOTUS"


def test_fetch_failure_fails_every_run_and_stores_nothing(db: Session, api: FakeDotApi) -> None:
    load_census(db, api)
    api.failing = {"inys-ebih"}

    with pytest.raises(SourceFetchError):
        ingest(db, api)

    runs = [r for r in db.scalars(select(IngestionRun)) if r.dataset_id in load_authority_rows()]
    assert len(runs) == 3  # the two legacy fetches, then the failing Motus one
    assert all(r.status == IngestionStatus.FAILED for r in runs)
    assert history(db) == []
