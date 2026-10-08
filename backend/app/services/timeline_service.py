"""Rebuild a carrier's authority and insurance timeline events from stored records."""

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models import Carrier
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.timeline_repository import TimelineRepository
from app.services.change_detection import (
    AUTHORITY_PREFIX,
    INSURANCE_PREFIX,
    authority_events,
    insurance_events,
)

logger = logging.getLogger(__name__)


class TimelineService:
    def __init__(
        self,
        db: Session,
        timeline: TimelineRepository,
        history: AuthorityHistoryRepository,
        authorities: AuthorityRepository,
        insurance: InsuranceRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.db = db
        self.timeline = timeline
        self.history = history
        self.authorities = authorities
        self.insurance = insurance
        self.today = today

    def rebuild(self, carrier: Carrier) -> tuple[int, int]:
        """Returns (events added, events removed)."""
        events = authority_events(self.history.for_carrier(carrier.id)) + insurance_events(
            self.insurance.for_carrier(carrier.id),
            self.authorities.for_carrier(carrier.id),
            self.today(),
        )
        added, removed = self.timeline.sync(
            carrier.id, events, managed_prefixes=(AUTHORITY_PREFIX, INSURANCE_PREFIX)
        )
        self.db.commit()
        logger.info(
            "USDOT %d timeline: %d events (%d added, %d removed)",
            carrier.usdot_number,
            len(events),
            added,
            removed,
        )
        return added, removed


def build_timeline_service(db: Session) -> TimelineService:
    return TimelineService(
        db,
        TimelineRepository(db),
        AuthorityHistoryRepository(db),
        AuthorityRepository(db),
        InsuranceRepository(db),
    )
