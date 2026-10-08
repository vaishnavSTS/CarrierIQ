"""On-demand carrier refresh (spec Section 19.2).

Census data and inspections are refreshed separately, each when it is missing or older than
`carrier_refresh_hours`: census age comes from the carrier, inspection age from the last
successful inspection run. So a failed inspection fetch is retried on the next request instead
of waiting out the census refresh window. If the source fails and older data exists, the older
data is served and flagged stale; a failed fetch never deletes or overwrites data (spec 19.1).
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

    def _recent(self, refreshed_at: datetime | None) -> bool:
        return refreshed_at is not None and self.now() - refreshed_at <= self.max_age

    def ensure_fresh(self, usdot_number: int) -> RefreshOutcome:
        existing = self.carriers.get_by_usdot(usdot_number)
        census_due = existing is None or not self._recent(existing.last_refreshed_at)
        inspections_due = existing is None or not self._recent(
            self.inspections.last_refreshed_at(usdot_number)
        )
        if not census_due and not inspections_due:
            return RefreshOutcome(existing, refreshed=False, stale=False)

        carrier = existing
        try:
            if census_due:
                result = self.census.ingest(usdot_number)
                if result.carrier is None:
                    # Not in the census. Keep serving what we have, if anything, but flag it.
                    return RefreshOutcome(existing, refreshed=False, stale=existing is not None)
                carrier = result.carrier
            if inspections_due:
                self.inspections.ingest(usdot_number)
        except (SourceFetchError, SourceDataError) as exc:
            if carrier is None:
                raise
            logger.warning("Refresh of USDOT %d failed, serving stored data: %s", usdot_number, exc)
            return RefreshOutcome(carrier, refreshed=False, stale=True)

        return RefreshOutcome(carrier, refreshed=True, stale=False)
