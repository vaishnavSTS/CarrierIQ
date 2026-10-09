"""Ownership events (spec Section 29): an ownership attestation recorded by the team, with any
later correction, as one signal; and platform alerts (e.g. a broker platform flagging the
carrier).

Evidence is the team-entered identity events themselves (source "manual", each with its
supporting document reference). The wording follows the spec's template: original event, later
correction, current interpretation, recommended action. Never labelled as fraud.

Severity MEDIUM for an attestation (corrected or not: brokers still see it), LOW for a platform
alert. Confidence HIGH: the events are first-hand records entered with documents.
"""

from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import IdentityEvent
from app.models.enums import Confidence, Severity
from app.repositories.identity_event_repository import IdentityEventRepository
from app.services.identity_events import (
    ATTESTATION_CORRECTED,
    EVENT_LABEL,
    OWNERSHIP_CHANGE_ATTESTED,
    OWNERSHIP_VERIFIED,
    PLATFORM_ALERT,
    timeline_key,
)

SIGNAL_TYPE = "OWNERSHIP_EVENT"


def _evidence(event: IdentityEvent) -> EvidenceValues:
    where = f" on {event.platform}" if event.platform else ""
    document = f" Document: {event.supporting_document}." if event.supporting_document else ""
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="identity_event",
        entity_id=event.id,
        raw_record_id=None,
        field_name=event.event_type.lower(),
        observed_value=(
            f"{event.event_date.isoformat()}: {EVENT_LABEL.get(event.event_type, event.event_type)}"
            f"{where}. {event.description or ''}".strip()
            + document
        ),
        observed_at=at_day(event.event_date),
        source=event.source,
    )


class OwnershipEventRule(Rule):
    rule_id = "ownership_event"
    rule_version = "1.0"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        events = IdentityEventRepository(context.db).for_carrier(context.carrier.id)
        verified = [e for e in events if e.event_type == OWNERSHIP_VERIFIED]
        signals = []
        for event in events:
            if event.event_type == OWNERSHIP_CHANGE_ATTESTED:
                signals.append(self._attestation(event, events, verified))
            elif event.event_type == PLATFORM_ALERT:
                where = event.platform or "a platform"
                signals.append(
                    SignalValues(
                        signal_key=f"{self.rule_id}:alert:{event.id}",
                        signal_type=SIGNAL_TYPE,
                        severity=Severity.LOW,
                        confidence=Confidence.HIGH,
                        title=f"Flagged on {where}",
                        description=(
                            f"Recorded by the team: {event.description or 'no details'}. Brokers "
                            f"who use {where} may see this when vetting the carrier."
                        ),
                        evidence=(_evidence(event),),
                    )
                )
        return signals

    def _attestation(
        self, event: IdentityEvent, events: list[IdentityEvent], verified: list[IdentityEvent]
    ) -> SignalValues:
        where = event.platform or "a platform"
        corrections = [
            e
            for e in events
            if e.event_type == ATTESTATION_CORRECTED and e.corrects_event_id == event.id
        ]
        if corrections:
            fixed = corrections[0]
            title = f"Conflicting ownership attestation on {where}"
            description = (
                f"Original event: ownership change attested on {where} on "
                f"{event.event_date.isoformat()}. Later correction: the carrier stated on "
                f"{fixed.event_date.isoformat()} that the attestation was made in error and "
                "ownership did not change. Current interpretation: a conflicting historical "
                f"attestation exists; {where} keeps both in its history, so brokers may still see "
                "an ownership alert. Recommended action: review supporting corporate and "
                "ownership documentation. This is not a finding of fraud."
            )
        else:
            title = f"Ownership change attested on {where}"
            description = (
                f"An ownership change was attested on {where} on {event.event_date.isoformat()} "
                "and has not been corrected. Brokers may treat the authority as sold. "
                "Recommended action: confirm whether ownership actually changed."
            )
        return SignalValues(
            signal_key=f"{self.rule_id}:attestation:{event.id}",
            timeline_event_key=timeline_key(event),
            signal_type=SIGNAL_TYPE,
            severity=Severity.MEDIUM,
            confidence=Confidence.HIGH,
            title=title,
            description=description,
            evidence=tuple(_evidence(e) for e in [event, *corrections, *verified]),
        )
