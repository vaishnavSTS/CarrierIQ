"""On-demand carrier refresh (spec Section 19.2).

Census data and each detail source (inspections, operating authority) are refreshed
separately, each when it is missing or older than `carrier_refresh_hours`: census age comes from
the carrier, a detail source's age from its last successful run. So a failed detail fetch is
retried on the next request instead of waiting out the census refresh window. If the source
fails and older data exists, the older data is served and flagged stale; a failed fetch never
deletes or overwrites data (spec 19.1).
"""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.core.exceptions import SourceDataError, SourceFetchError
from app.models import Carrier
from app.repositories.carrier_repository import CarrierRepository
from app.services.census_ingestion_service import CensusIngestionService

logger = logging.getLogger(__name__)


class DetailSource(Protocol):
    """Per-carrier data fetched after the census record (e.g. inspections, authority)."""

    def last_refreshed_at(self, usdot_number: int) -> datetime | None: ...

    def ingest(self, usdot_number: int) -> object: ...


@dataclass(frozen=True)
class RefreshOutcome:
    carrier: Carrier | None  # None: not in our database and not in the source
    refreshed: bool  # fetched from the source during this call
    stale: bool  # a refresh was due but failed; older data is being served


class CarrierRefreshService:
    def __init__(
        self,
        carriers: CarrierRepository,
        census: CensusIngestionService,
        details: Sequence[DetailSource],
        max_age: timedelta,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        after_refresh: Callable[[Carrier], object] | None = None,
    ) -> None:
        self.carriers = carriers
        # Runs after a successful refresh, e.g. rebuilding the carrier's timeline.
        self.after_refresh = after_refresh
        self.census = census
        self.details = details
        self.max_age = max_age
        self.now = now

    def _recent(self, refreshed_at: datetime | None) -> bool:
        return refreshed_at is not None and self.now() - refreshed_at <= self.max_age

    def ensure_fresh(self, usdot_number: int) -> RefreshOutcome:
        existing = self.carriers.get_by_usdot(usdot_number)
        census_due = existing is None or not self._recent(existing.last_refreshed_at)
        details_due = [
            source
            for source in self.details
            if existing is None or not self._recent(source.last_refreshed_at(usdot_number))
        ]
        if not census_due and not details_due:
            return RefreshOutcome(existing, refreshed=False, stale=False)

        carrier = existing
        try:
            if census_due:
                result = self.census.ingest(usdot_number)
                if result.carrier is None:
                    # Not in the census. Keep serving what we have, if anything, but flag it.
                    return RefreshOutcome(existing, refreshed=False, stale=existing is not None)
                carrier = result.carrier
            for source in details_due:
                source.ingest(usdot_number)
        except (SourceFetchError, SourceDataError) as exc:
            if carrier is None:
                raise
            logger.warning("Refresh of USDOT %d failed, serving stored data: %s", usdot_number, exc)
            return RefreshOutcome(carrier, refreshed=False, stale=True)

        if carrier is not None and self.after_refresh is not None:
            self.after_refresh(carrier)
        return RefreshOutcome(carrier, refreshed=True, stale=False)
