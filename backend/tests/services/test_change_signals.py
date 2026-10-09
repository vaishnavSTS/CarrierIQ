"""Authority and insurance change signals (requires TEST_DATABASE_URL).

USDOT 295017's real FMCSA records: MC139446 revoked 2021-06-08, reinstated 2021-06-15; BI&PD
coverage increased 2018-01-01. Rules look back two years from "today".
"""

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.base_rule import RuleContext
from app.intelligence.rules.authority_change import AuthorityChangeRule
from app.intelligence.rules.insurance_change import InsuranceChangeRule
from app.models import Authority, Carrier, Insurance
from app.models.enums import Confidence, DocketPrefix, Severity
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.signal_repository import SignalRepository
from app.repositories.timeline_repository import TimelineRepository
from app.services.signal_service import SignalService, default_rules
from app.services.timeline_service import TimelineService
from tests.factories import make_carrier, make_raw_record
from tests.services.fmcsa import fmcsa_api, load_census_authority_insurance


def loaded(db: Session) -> Carrier:
    load_census_authority_insurance(db, fmcsa_api())
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None
    return carrier


def on(db: Session, carrier: Carrier, day: date) -> RuleContext:
    return RuleContext(db, carrier, day)


def test_recent_authority_actions_become_signals(db: Session) -> None:
    carrier = loaded(db)

    found = {s.title: s for s in AuthorityChangeRule().evaluate(on(db, carrier, date(2022, 1, 1)))}

    assert set(found) == {"Authority revoked (MC139446)", "Authority reinstated (MC139446)"}
    revoked = found["Authority revoked (MC139446)"]
    assert (revoked.severity, revoked.confidence) == (Severity.HIGH, Confidence.HIGH)
    assert "legally operate" in revoked.description  # why it matters
    assert revoked.evidence
    for evidence in revoked.evidence:  # the revocation itself, never another action of its row
        assert (evidence.entity_type, evidence.field_name) == ("authority_history", "action")
        assert evidence.raw_record_id is not None
        assert evidence.observed_value is not None
        assert "REVOK" in evidence.observed_value.upper()
        assert "2021-06-08" in evidence.observed_value
    reinstated = found["Authority reinstated (MC139446)"]
    assert {e.source for e in reinstated.evidence} == {"MOTUS", "LEGACY_LI"}  # both systems
    assert "legally operate" not in reinstated.description  # INFO: no concern added


def test_old_actions_stay_history(db: Session) -> None:
    carrier = loaded(db)

    assert AuthorityChangeRule().evaluate(on(db, carrier, date(2026, 10, 8))) == []


def test_revocation_pending(db: Session) -> None:
    carrier = loaded(db)
    authority = db.scalars(select(Authority).where(Authority.carrier_id == carrier.id)).one()
    authority.revocation_pending = True

    found = AuthorityChangeRule().evaluate(on(db, carrier, date(2026, 10, 8)))

    (pending,) = found
    assert pending.signal_key == "authority_change:revocation_pending:MC139446"
    assert (pending.severity, pending.evidence[0].entity_type) == (Severity.MEDIUM, "authority")


def test_insurer_and_coverage_changes(db: Session) -> None:
    carrier = loaded(db)

    found = InsuranceChangeRule().evaluate(on(db, carrier, date(2019, 1, 1)))

    increase = next(s for s in found if s.title == "BI&PD coverage increased (MC139446)")
    assert (increase.severity, increase.confidence) == (Severity.INFO, Confidence.HIGH)
    assert increase.evidence[0].entity_type == "insurance"
    assert all(s.evidence for s in found)


def filing(db: Session, carrier: Carrier, n: int, start: date, end: date | None) -> Insurance:
    row = Insurance(
        carrier_id=carrier.id,
        docket_prefix=DocketPrefix.MC,
        docket_number="999",
        insurer=f"INSURER {n}",
        insurance_type="BIPD",
        policy_number=f"P{n}",
        coverage_amount=750_000,
        effective_date=start,
        termination_date=end,
        status="CANCELLED" if end else "ACTIVE",
        on_file=end is None,
        source_system="MOTUS",
        source="dot_socrata",
        raw_record_id=make_raw_record(db, external_id=f"filing-{n}").id,
    )
    db.add(row)
    db.flush()
    return row


def test_gap_has_evidence_on_both_sides(db: Session) -> None:
    carrier = make_carrier(db)
    before = filing(db, carrier, 1, date(2025, 1, 1), date(2025, 6, 30))
    after = filing(db, carrier, 2, date(2025, 8, 1), None)

    found = InsuranceChangeRule().evaluate(on(db, carrier, date(2026, 10, 8)))

    gap = next(
        s for s in found if s.signal_key.startswith("insurance_change:insurance:MC999:BIPD:GAP")
    )
    assert (gap.severity, gap.confidence) == (Severity.MEDIUM, Confidence.MEDIUM)  # inferred
    assert [e.entity_id for e in gap.evidence] == [before.id, after.id]
    assert gap.evidence[0].observed_value is not None
    assert gap.evidence[0].observed_value.startswith("Before the gap")
    cancelled = next(s for s in found if "cancelled" in s.title)
    assert cancelled.severity == Severity.MEDIUM  # nothing on file the next day


def test_all_rules_save_together(db: Session) -> None:
    carrier = loaded(db)
    now = datetime(2022, 1, 1, tzinfo=UTC)
    TimelineService(
        db,
        TimelineRepository(db),
        AuthorityHistoryRepository(db),
        AuthorityRepository(db),
        InsuranceRepository(db),
        today=lambda: now.date(),
    ).rebuild(carrier)

    results = SignalService(
        db, SignalRepository(db), TimelineRepository(db), default_rules(), now=lambda: now
    ).rebuild(carrier)

    assert results["authority_change"] == (2, 0)
    linked = {e.title: e.signal_id for e in TimelineRepository(db).for_carrier(carrier.id)}
    assert linked["Authority revoked (MC139446)"] is not None  # the timeline links its signal
    assert linked["Authority granted (MC139446)"] is None  # 1986: history, no signal
    saved = SignalRepository(db).for_carrier(carrier.id)
    assert {s.signal_type for s in saved} >= {"AUTHORITY_CHANGE"}
    assert all(SignalRepository(db).evidence_for([s.id for s in saved]).values())
