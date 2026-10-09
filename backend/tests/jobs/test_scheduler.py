"""Scheduled ingestion (requires TEST_DATABASE_URL)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.jobs.handlers import REFRESH_CARRIER
from app.jobs.queue import PostgresJobQueue
from app.jobs.scheduler import Schedule, schedule_stale_refreshes
from app.models import Job
from app.models.enums import JobStatus
from tests.factories import make_carrier

NOW = datetime(2026, 10, 9, 12, tzinfo=UTC)


def carrier(db: Session, usdot: int, hours_ago: float | None) -> None:
    row = make_carrier(db, usdot_number=usdot, legal_name=f"CARRIER {usdot}")
    row.last_refreshed_at = None if hours_ago is None else NOW - timedelta(hours=hours_ago)
    db.flush()


def schedule(db: Session, limit: int | None = None) -> list[int]:
    return schedule_stale_refreshes(db, PostgresJobQueue(db, now=lambda: NOW), NOW, limit)


def test_stale_carriers_are_queued_oldest_first(db: Session) -> None:
    carrier(db, 1001, hours_ago=2)  # fresh
    carrier(db, 1002, hours_ago=30)
    carrier(db, 1003, hours_ago=100)
    carrier(db, 1004, hours_ago=None)  # never refreshed

    assert schedule(db) == [1004, 1003, 1002]
    jobs = db.scalars(select(Job).order_by(Job.id)).all()
    assert (jobs[0].job_type, jobs[0].payload) == (
        REFRESH_CARRIER,
        {"usdot_number": 1004, "force": True},  # the round decided; the job must not skip it
    )


def test_batch_size_and_no_duplicates(db: Session) -> None:
    for usdot in (2001, 2002, 2003):
        carrier(db, usdot, hours_ago=48)

    assert schedule(db, limit=2) == [2001, 2002]
    assert schedule(db, limit=2) == [2003]  # the first two already have a job waiting
    assert schedule(db) == []


def test_recently_failed_refresh_waits_for_the_cooldown(db: Session) -> None:
    carrier(db, 3001, hours_ago=48)
    queue = PostgresJobQueue(db, now=lambda: NOW)
    assert schedule(db) == [3001]
    job = db.scalars(select(Job)).one()
    job.status = JobStatus.FAILED
    job.finished_at = NOW - timedelta(hours=1)
    db.flush()

    assert schedule(db) == []  # gave up an hour ago: wait

    job.finished_at = NOW - timedelta(hours=7)
    db.flush()
    assert schedule(db) == [3001]
    assert queue.claim("w") is not None


def test_schedule_rounds() -> None:
    clock = [NOW]
    rounds = Schedule(now=lambda: clock[0])

    assert rounds.due()  # first round straight away
    rounds.ran()
    assert not rounds.due()
    clock[0] += timedelta(minutes=15)
    assert rounds.due()
