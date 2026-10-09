"""What each job type does. A handler raises to fail the attempt (the queue retries it) and
returns a small JSON-able result on success.
"""

from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierIQError, CarrierNotFoundError
from app.ingestion.socrata_client import SocrataClient
from app.ingestion.vpic import VpicClient
from app.repositories.carrier_repository import CarrierRepository
from app.services.carrier_refresh_factory import build_refresh_service
from app.services.signal_service import build_signal_service

REFRESH_CARRIER = "refresh_carrier"
REBUILD_SIGNALS = "rebuild_signals"

Handler = Callable[[Session, dict[str, Any]], dict[str, Any]]


class RefreshIncompleteError(CarrierIQError):
    """A source failed, so stored data was kept; the job should be retried."""

    code = "refresh_incomplete"


def refresh_dedupe_key(usdot_number: int) -> str:
    return f"{REFRESH_CARRIER}:{usdot_number}"


def refresh_carrier(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Refresh one carrier from every source when due (or always with "force"), then rebuild
    its VIN links, timeline and signals, exactly as opening it in the app does."""
    usdot = int(payload["usdot_number"])
    client, vpic = SocrataClient(), VpicClient()
    try:
        service = build_refresh_service(db, client, vpic)
        outcome = service.ensure_fresh(usdot, force=bool(payload.get("force")))
    finally:
        client.close()
        vpic.close()
    if outcome.carrier is None:
        raise CarrierNotFoundError(f"USDOT {usdot} is not in the FMCSA census")
    if outcome.stale:
        raise RefreshIncompleteError(f"USDOT {usdot}: a source failed; stored data kept")
    return {"usdot_number": usdot, "refreshed": outcome.refreshed}


def rebuild_signals(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Re-run the signal rules from stored data (no source fetches), e.g. after a rule change."""
    usdot = int(payload["usdot_number"])
    carrier = CarrierRepository(db).get_by_usdot(usdot)
    if carrier is None:
        raise CarrierNotFoundError(f"USDOT {usdot} is not loaded")
    results = build_signal_service(db).rebuild(carrier)
    return {"usdot_number": usdot, "signals": {rule: new for rule, (new, _) in results.items()}}


HANDLERS: dict[str, Handler] = {
    REFRESH_CARRIER: refresh_carrier,
    REBUILD_SIGNALS: rebuild_signals,
}
