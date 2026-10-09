"""Insurance change (spec Section 12.2): insurer and coverage changes, cancellations and gaps in
the last two years, and required liability insurance not on file now.

Built on the timeline's change detection (services/change_detection.py), so a signal and its
timeline event always agree. A normal change of insurer is reported as information (INFO),
never as a concern (spec 12.2).

Confidence (spec 13.1): HIGH for a change shown by one filing record (new insurer, coverage,
cancellation); MEDIUM for a gap or nothing on file, which is inferred from the absence of
filings and FMCSA's lists may be incomplete.
"""

from collections.abc import Sequence
from datetime import timedelta

from app.core.config import get_settings
from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import Insurance
from app.models.enums import Confidence
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.services.change_detection import INSURANCE_PREFIX, insurance_events

SIGNAL_TYPE = "INSURANCE_CHANGE"
INFERRED = ("GAP", "NONE_ON_FILE")


def _filing_evidence(filing: Insurance, note: str) -> EvidenceValues:
    docket = f"{filing.docket_prefix.value}{filing.docket_number}" if filing.docket_prefix else "?"
    ended = (
        f", ended {filing.termination_date.isoformat()}"
        if filing.termination_date
        else (", on file" if filing.on_file else "")
    )
    effective = filing.effective_date.isoformat() if filing.effective_date else "unknown"
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="insurance",
        entity_id=filing.id,
        raw_record_id=filing.raw_record_id,
        field_name="filing",
        observed_value=(
            f"{note}: {filing.insurance_type or 'filing'} on {docket} with "
            f"{filing.insurer or 'unknown insurer'}, policy {filing.policy_number or '(none)'}, "
            f"effective {effective}{ended}"
        ),
        observed_at=at_day(filing.termination_date or filing.effective_date),
        source=filing.source_system,
    )


def _ended_before(filings: Sequence[Insurance], day: object, kind: str) -> list[Insurance]:
    """Filings of this type whose cover ended the day before `day` (the start of a gap)."""
    return [
        f
        for f in filings
        if f.insurance_type == kind
        and f.termination_date is not None
        and f.termination_date + timedelta(days=1) == day
    ]


class InsuranceChangeRule(Rule):
    rule_id = "insurance_change"
    rule_version = "1.0"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        carrier_id = context.carrier.id
        filings = InsuranceRepository(context.db).for_carrier(carrier_id)
        authorities = AuthorityRepository(context.db).for_carrier(carrier_id)
        since = context.today - timedelta(days=get_settings().signal_lookback_days)
        by_raw: dict[int | None, Insurance] = {f.raw_record_id: f for f in filings}

        signals = []
        for event in insurance_events(filings, authorities, context.today):
            kind = event.event_type.removeprefix(INSURANCE_PREFIX)
            ongoing = kind == "NONE_ON_FILE"
            filing = by_raw.get(event.raw_record_id)
            if filing is None or (event.event_date < since and not ongoing):
                continue
            evidence = [_filing_evidence(filing, "Filing")]
            if kind == "GAP":
                evidence = [
                    _filing_evidence(f, "Before the gap")
                    for f in _ended_before(filings, event.event_date, filing.insurance_type or "")
                ] + [_filing_evidence(filing, "After the gap")]
            elif ongoing:
                evidence = [_filing_evidence(filing, "Last filing on file")]
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:{event.event_key}",
                    signal_type=SIGNAL_TYPE,
                    severity=event.severity,
                    confidence=Confidence.MEDIUM if kind in INFERRED else Confidence.HIGH,
                    title=event.title,
                    description=event.description,
                    evidence=tuple(evidence),
                )
            )
        return signals
