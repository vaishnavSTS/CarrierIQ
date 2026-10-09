"""Ownership and identity events entered by the team (spec Section 29).

No public dataset publishes ownership attestations (Highway, Carrier Assure, RMIS and
MyCarrierPackets have no open feed), so they are recorded by hand with a reference to the
supporting document. Event -> Correction -> Current state: a correction is a new event pointing
at the one it corrects; the original is never removed, matching how the platforms keep it.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.models import IdentityEvent
from app.models.enums import Severity
from app.services.change_detection import TimelineEventValues

OWNERSHIP_CHANGE_ATTESTED = "OWNERSHIP_CHANGE_ATTESTED"
ATTESTATION_CORRECTED = "ATTESTATION_CORRECTED"
PLATFORM_ALERT = "PLATFORM_ALERT"
OWNERSHIP_VERIFIED = "OWNERSHIP_VERIFIED"
NOTE = "NOTE"

EVENT_TYPES = (
    OWNERSHIP_CHANGE_ATTESTED,
    ATTESTATION_CORRECTED,
    PLATFORM_ALERT,
    OWNERSHIP_VERIFIED,
    NOTE,
)

EVENT_LABEL = {
    OWNERSHIP_CHANGE_ATTESTED: "Ownership change attested",
    ATTESTATION_CORRECTED: "Attestation corrected",
    PLATFORM_ALERT: "Flagged on a platform",
    OWNERSHIP_VERIFIED: "Ownership verified from documents",
    NOTE: "Note",
}


@dataclass(frozen=True)
class OwnershipState:
    """What the recorded events add up to, in the spec's words (Section 29)."""

    state: str  # NONE | ATTESTED | CONFLICTING | VERIFIED
    summary: str
    action: str | None


def ownership_state(events: Sequence[IdentityEvent]) -> OwnershipState:
    attested = [e for e in events if e.event_type == OWNERSHIP_CHANGE_ATTESTED]
    corrected = {e.corrects_event_id for e in events if e.event_type == ATTESTATION_CORRECTED}
    verified = [e for e in events if e.event_type == OWNERSHIP_VERIFIED]
    if not attested:
        if verified:
            return OwnershipState(
                "VERIFIED",
                "Ownership verified from documents; no ownership change recorded.",
                None,
            )
        return OwnershipState("NONE", "No ownership events recorded.", None)
    if all(e.id in corrected for e in attested):
        where = ", ".join(sorted({e.platform or "a platform" for e in attested}))
        summary = (
            f"Conflicting historical attestation exists on {where}: an ownership change was "
            "attested and later corrected as an error. The original attestation stays in the "
            "platform's history."
        )
        if verified:
            summary += " Supporting documents have been reviewed and show no change of ownership."
        return OwnershipState(
            "CONFLICTING",
            summary,
            "Review supporting corporate and ownership documentation (Secretary of State filing, "
            "MCS-150, certificate of insurance) and share it with brokers who see the alert.",
        )
    return OwnershipState(
        "ATTESTED",
        "An ownership change was attested and has not been corrected.",
        "Confirm whether ownership actually changed. FMCSA does not allow USDOT or MC numbers "
        "to be sold or transferred outside a legitimate change of the same company.",
    )


IDENTITY_PREFIX = "IDENTITY_"
_TIMELINE_SEVERITY = {
    OWNERSHIP_CHANGE_ATTESTED: Severity.MEDIUM,
    PLATFORM_ALERT: Severity.LOW,
}


def timeline_key(event: IdentityEvent) -> str:
    return f"identity:{event.id}"


def timeline_events(events: Sequence[IdentityEvent]) -> list[TimelineEventValues]:
    """One timeline entry per recorded event (entered by the team, so no raw source record)."""
    return [
        TimelineEventValues(
            event_key=timeline_key(e),
            event_type=f"{IDENTITY_PREFIX}{e.event_type}",
            event_date=e.event_date,
            severity=_TIMELINE_SEVERITY.get(e.event_type, Severity.INFO),
            title=EVENT_LABEL.get(e.event_type, e.event_type)
            + (f" on {e.platform}" if e.platform else ""),
            description=(e.description or "") + " (recorded by the team)",
            raw_record_id=None,
        )
        for e in events
    ]
