"""What a client may see of their own carrier: the staff answers minus STS-internal data.

Internal (never sent to clients): intelligence signal links and review status, and anything the
STS team entered by hand (identity events: ownership attestations, platform alerts, notes), which
reaches the timeline as IDENTITY_* events. Everything else is public FMCSA / NHTSA data.
"""

from app.schemas.carrier_profile import CarrierProfile
from app.schemas.carrier_safety import CarrierSafetyOut
from app.schemas.network import NetworkOut, OwnershipStateOut
from app.services.identity_events import IDENTITY_PREFIX


def client_profile(profile: CarrierProfile) -> CarrierProfile:
    return profile.model_copy(
        update={
            "review_status": None,
            "open_signal_count": 0,
            "highest_open_severity": None,
            "timeline": [
                e.model_copy(update={"signal_id": None})
                for e in profile.timeline
                if not e.event_type.startswith(IDENTITY_PREFIX)
            ],
        }
    )


def client_network(network: NetworkOut) -> NetworkOut:
    return network.model_copy(
        update={
            "linked_carriers": [
                c.model_copy(update={"signal_id": None}) for c in network.linked_carriers
            ],
            "identity_events": [],
            # Built from the team's attestations, so it is internal too.
            "ownership": OwnershipStateOut(state="NONE", summary="", action=None),
        }
    )


def client_safety(safety: CarrierSafetyOut) -> CarrierSafetyOut:
    """Clients see whether each BASIC is over FMCSA's threshold, not the estimated percentile:
    property carriers' percentiles are kept from public view (docs/estimated-iss-v1.md, 8.2)."""
    iss = safety.estimated_iss
    if iss is None:
        return safety
    hidden = [b.model_copy(update={"percentile": None}) for b in iss.basics]
    return safety.model_copy(update={"estimated_iss": iss.model_copy(update={"basics": hidden})})
