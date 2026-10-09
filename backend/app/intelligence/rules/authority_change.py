"""Authority change (spec Section 12.1): operating-authority actions in the last two years, and
revocations now pending.

Built on the timeline's change detection (services/change_detection.py), so a signal and its
timeline event always agree. Older actions stay on the timeline as history, not signals.

Confidence (spec 13.1): HIGH — each signal is one authoritative FMCSA record of the exact fact.
Severity follows the action: revoked / suspended / out of service HIGH, revocation started or
inactivated MEDIUM, withdrawn / expired / application not granted LOW, granted / reinstated INFO.
"""

from collections import defaultdict
from datetime import timedelta

from app.core.config import get_settings
from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import AuthorityHistory
from app.models.enums import Confidence, Severity
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.services.change_detection import authority_event_key, authority_events

SIGNAL_TYPE = "AUTHORITY_CHANGE"
WHY = (
    " Why it matters: operating authority status may affect whether the carrier can legally "
    "operate under that authority."
)


def _action_evidence(row: AuthorityHistory) -> EvidenceValues:
    after = f"; status afterwards {row.status}" if row.status else ""
    day = row.action_date.isoformat() if row.action_date else "undated"
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="authority_history",
        entity_id=row.id,
        raw_record_id=row.raw_record_id,
        field_name="action",
        observed_value=f"{row.action} on {day}{after}",
        observed_at=at_day(row.action_date),
        source=row.source_system,
    )


class AuthorityChangeRule(Rule):
    rule_id = "authority_change"
    rule_version = "1.2"  # 1.2: transfers and renumberings recognised

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        carrier_id = context.carrier.id
        history = AuthorityHistoryRepository(context.db).for_carrier(carrier_id)
        since = context.today - timedelta(days=get_settings().signal_lookback_days)
        # Every source row behind each event: both FMCSA systems may report the same action.
        rows_by_event: dict[str, list[AuthorityHistory]] = defaultdict(list)
        for row in sorted(history, key=lambda r: (r.source_system != "MOTUS", r.id)):
            key = authority_event_key(row)
            same = (row.source_system, row.action, row.status)
            # Identical copies of one action in the same system are listed once.
            if key and same not in {
                (r.source_system, r.action, r.status) for r in rows_by_event[key]
            }:
                rows_by_event[key].append(row)

        signals = []
        for event in authority_events(history):
            rows = rows_by_event.get(event.event_key, [])
            if event.event_date < since or not rows:
                continue
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:{event.event_key}",
                    timeline_event_key=event.event_key,
                    signal_type=SIGNAL_TYPE,
                    severity=event.severity,
                    confidence=Confidence.HIGH,
                    title=event.title,
                    description=event.description
                    + ("" if event.severity == Severity.INFO else WHY),
                    evidence=tuple(_action_evidence(row) for row in rows),
                )
            )

        for authority in AuthorityRepository(context.db).for_carrier(carrier_id):
            if not authority.revocation_pending:
                continue
            docket = f"{authority.docket_prefix.value}{authority.docket_number}"
            as_of = (
                authority.status_as_of.isoformat() if authority.status_as_of else "the last refresh"
            )
            status = authority.status or "unknown"
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:revocation_pending:{docket}",
                    signal_type=SIGNAL_TYPE,
                    severity=Severity.MEDIUM,
                    confidence=Confidence.HIGH,
                    title=f"Revocation pending ({docket})",
                    description=(
                        f"FMCSA records show a revocation pending for {docket}, based on records "
                        f"as of {as_of}. "
                        "The authority is not revoked yet; the carrier may still resolve it, for "
                        "example by filing the required insurance." + WHY
                    ),
                    evidence=(
                        EvidenceValues(
                            evidence_type="RECORD",
                            entity_type="authority",
                            entity_id=authority.id,
                            raw_record_id=authority.raw_record_id,
                            field_name="revocation_pending",
                            observed_value=f"{docket}: revocation pending; status {status}",
                            observed_at=at_day(authority.status_as_of),
                            source=authority.status_source,
                        ),
                    ),
                )
            )
        return signals
