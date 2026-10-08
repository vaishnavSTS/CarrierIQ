"""Timeline rebuild against the database (requires TEST_DATABASE_URL)."""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IntelligenceSignal, TimelineEvent
from app.models.enums import Confidence, Severity
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.timeline_repository import TimelineRepository
from app.services.timeline_service import TimelineService
from tests.ingestion.helpers import FakeDotApi
from tests.services.fmcsa import fmcsa_api, load_census_authority_insurance

TODAY = date(2026, 10, 8)


def service(db: Session) -> TimelineService:
    return TimelineService(
        db,
        TimelineRepository(db),
        AuthorityHistoryRepository(db),
        AuthorityRepository(db),
        InsuranceRepository(db),
        today=lambda: TODAY,
    )


@pytest.fixture
def api() -> FakeDotApi:
    return fmcsa_api()


def events(db: Session) -> list[TimelineEvent]:
    return list(db.scalars(select(TimelineEvent).order_by(TimelineEvent.event_date)))


def test_rebuild_creates_events_once(db: Session, api: FakeDotApi) -> None:
    load_census_authority_insurance(db, api)
    united = CarrierRepository(db).get_by_usdot(295017)
    assert united is not None

    added, _ = service(db).rebuild(united)
    again = service(db).rebuild(united)

    stored = events(db)
    assert added == len(stored) > 0
    assert again == (0, 0)
    revoked = next(e for e in stored if e.event_type == "AUTHORITY_REVOKED")
    assert (revoked.event_date, revoked.severity) == (date(2021, 6, 8), Severity.HIGH)
    assert revoked.raw_record_id is not None
    assert len({e.event_key for e in stored}) == len(stored)


def test_event_no_longer_produced_is_removed_unless_a_signal_uses_it(
    db: Session,
    api: FakeDotApi,
) -> None:
    load_census_authority_insurance(db, api)
    united = CarrierRepository(db).get_by_usdot(295017)
    assert united is not None
    service(db).rebuild(united)
    signal = IntelligenceSignal(
        carrier_id=united.id,
        signal_type="TEST",
        rule_id="test",
        rule_version="1",
        severity=Severity.LOW,
        title="t",
        confidence=Confidence.LOW,
    )
    db.add(signal)
    db.flush()
    stale = [
        TimelineEvent(
            carrier_id=united.id,
            event_key=f"authority:MC139446:OLD:{n}",
            event_type="AUTHORITY_OLD",
            event_date=date(2000, 1, 1),
            severity=Severity.INFO,
            title="stale",
            signal_id=signal.id if n == 2 else None,
        )
        for n in (1, 2)
    ]
    db.add_all(stale)
    db.flush()

    _, removed = service(db).rebuild(united)

    keys = {e.event_key for e in events(db)}
    assert removed == 1
    assert "authority:MC139446:OLD:1" not in keys
    assert "authority:MC139446:OLD:2" in keys  # a signal points at it
