"""Scheduled ingestion (spec Phase 10): keep loaded carriers fresh without anyone opening them.

Each round queues a `refresh_carrier` job for the carriers whose census data is older than
`carrier_refresh_hours` (never refreshed first, then oldest), at most `schedule_batch_size` per
round so FMCSA is not flooded. A carrier with a refresh already waiting or running is skipped (the
queue's dedupe key), and so is one whose refresh gave up recently, so a source that is down
for one carrier isn't retried every round. Several workers may run rounds at the same time:
the dedupe key keeps it to one job per carrier.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import String, and_, cast, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.jobs.handlers import BUILD_ISS_REFERENCE, REFRESH_CARRIER, refresh_dedupe_key
from app.jobs.queue import JobQueue
from app.models import Carrier, IssReference, Job
from app.models.enums import JobStatus

logger = logging.getLogger(__name__)


def stale_carriers(db: Session, now: datetime, limit: int) -> list[int]:
    """USDOT numbers due for a scheduled refresh, oldest data first."""
    settings = get_settings()
    due = now - timedelta(hours=settings.carrier_refresh_hours)
    cooldown = now - timedelta(hours=settings.schedule_failed_cooldown_hours)
    key = Job.dedupe_key == func.concat(f"{REFRESH_CARRIER}:", cast(Carrier.usdot_number, String))
    busy_or_failed = exists().where(
        key,
        or_(
            Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
            and_(Job.status == JobStatus.FAILED, Job.finished_at >= cooldown),
        ),
    )
    return list(
        db.scalars(
            select(Carrier.usdot_number)
            .where(
                or_(Carrier.last_refreshed_at.is_(None), Carrier.last_refreshed_at < due),
                ~busy_or_failed,
            )
            .order_by(Carrier.last_refreshed_at.asc().nulls_first(), Carrier.usdot_number)
            .limit(limit)
        )
    )


def schedule_stale_refreshes(
    db: Session, queue: JobQueue, now: datetime, limit: int | None = None
) -> list[int]:
    """Queue refreshes for stale carriers; returns the USDOT numbers queued."""
    batch = limit if limit is not None else get_settings().schedule_batch_size
    queued = [
        usdot
        for usdot in stale_carriers(db, now, batch)
        # force: this round already decided the carrier is due; the job must not decide again
        # with different settings (e.g. another worker's refresh window) and skip it.
        if queue.enqueue(
            REFRESH_CARRIER, {"usdot_number": usdot, "force": True}, refresh_dedupe_key(usdot)
        )
    ]
    if queued:
        logger.info("Scheduled refresh of %d stale carrier(s): %s", len(queued), queued)
    return queued


def schedule_iss_reference(db: Session, queue: JobQueue, now: datetime) -> bool:
    """Queue this month's Estimated ISS tables when they haven't been built yet (FMCSA publishes
    SMS results monthly). Returns whether a job was queued."""
    month = now.date().replace(day=1)
    if db.scalar(select(IssReference.id).where(IssReference.data_month == month)) is not None:
        return False
    key = f"{BUILD_ISS_REFERENCE}:{month:%Y-%m}"
    cooldown = now - timedelta(hours=get_settings().schedule_failed_cooldown_hours)
    gave_up = db.scalar(
        select(Job.id).where(
            Job.dedupe_key == key, Job.status == JobStatus.FAILED, Job.finished_at >= cooldown
        )
    )
    if gave_up is not None:  # a large download that keeps failing waits before trying again
        return False
    queued = queue.enqueue(BUILD_ISS_REFERENCE, {}, key)
    if queued is not None:
        logger.info("Scheduled Estimated ISS tables for %s", f"{month:%Y-%m}")
    return queued is not None


class Schedule:
    """Decides when the next round is due; one per worker."""

    def __init__(self, now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.now = now
        self.interval = timedelta(minutes=get_settings().schedule_interval_minutes)
        self.next_round: datetime | None = None  # None: run a round straight away

    def due(self) -> bool:
        return self.next_round is None or self.now() >= self.next_round

    def ran(self) -> None:
        self.next_round = self.now() + self.interval
