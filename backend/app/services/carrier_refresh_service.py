"""On-demand carrier refresh (spec Section 19.2).

A carrier that is missing or older than `carrier_refresh_hours` is fetched live: census first,
then inspections. If the source fails and older data exists, the older data is served and
flagged stale; a failed fetch never deletes or overwrites data (spec Section 19.1).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.exceptions import SourceDataError, SourceFetchError
from app.models import Carrier
from app.repositories.carrier_repository import CarrierRepository
from app.services.census_ingestion_service import CensusIngestionService
from app.services.inspection_ingestion_service import InspectionIngestionService

logger = logging.getLogger(__name__)


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
        inspections: InspectionIngestionService,
        max_age: timedelta,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.carriers = carriers
        self.census = census
        self.inspections = inspections
        self.max_age = max_age
        self.now = now

    def is_fresh(self, carrier: Carrier) -> bool:
        refreshed_at = carrier.last_refreshed_at
        return refreshed_at is not None and self.now() - refreshed_at <= self.max_age

    def ensure_fresh(self, usdot_number: int) -> RefreshOutcome:
        existing = self.carriers.get_by_usdot(usdot_number)
        if existing is not None and self.is_fresh(existing):
            return RefreshOutcome(existing, refreshed=False, stale=False)

        try:
            result = self.census.ingest(usdot_number)
            if result.carrier is None:
                # Not in the census. Keep serving what we have, if anything, but flag it.
                return RefreshOutcome(existing, refreshed=False, stale=existing is not None)
            self.inspections.ingest(usdot_number)
        except (SourceFetchError, SourceDataError) as exc:
            if existing is None:
                raise
            logger.warning("Refresh of USDOT %d failed, serving stored data: %s", usdot_number, exc)
            return RefreshOutcome(existing, refreshed=False, stale=True)

        return RefreshOutcome(result.carrier, refreshed=True, stale=False)
