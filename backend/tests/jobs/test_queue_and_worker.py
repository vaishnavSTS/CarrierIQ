"""PostgreSQL job queue and the worker (requires TEST_DATABASE_URL)."""

from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.jobs.handlers import REBUILD_SIGNALS, refresh_dedupe_key
from app.jobs.queue import PostgresJobQueue
from app.models import Job
from app.models.enums import JobStatus
from app.workers.worker import Worker
from tests.factories import make_carrier


class Clock:
    def __init__(self) -> None:
        self.at = datetime(2026, 10, 9, 12, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.at

    def advance(self, **delta: float) -> None:
        self.at += timedelta(**delta)


@pytest.fixture
def clock() -> Clock:
    return Clock()


def queue(db: Session, clock: Clock) -> PostgresJobQueue:
    return PostgresJobQueue(db, now=clock)


def worker(db: Session, clock: Clock, handlers: dict[str, Any]) -> Worker:
    return Worker(
        session_factory=lambda: nullcontext(db),  # type: ignore[arg-type,return-value]
        queue_factory=lambda s: PostgresJobQueue(s, now=clock),
        handlers=handlers,
        name="test-worker",
    )


def test_one_pending_job_per_dedupe_key(db: Session, clock: Clock) -> None:
    q = queue(db, clock)

    first = q.enqueue("refresh_carrier", {"usdot_number": 1}, refresh_dedupe_key(1))
    again = q.enqueue("refresh_carrier", {"usdot_number": 1}, refresh_dedupe_key(1))

    assert first is not None and again is None
    claimed = q.claim("w")
    assert claimed is not None
    q.complete(claimed.id, {})
    # Once the job is finished, the same key can be queued again.
    assert q.enqueue("refresh_carrier", {"usdot_number": 1}, refresh_dedupe_key(1)) is not None


def test_failures_retry_with_backoff_then_give_up(db: Session, clock: Clock) -> None:
    calls: list[int] = []

    def flaky(_: Session, payload: dict[str, Any]) -> dict[str, Any]:
        calls.append(payload["n"])
        raise RuntimeError("FMCSA is down")

    w = worker(db, clock, {"flaky": flaky})
    job_id = queue(db, clock).enqueue("flaky", {"n": 1})
    assert job_id is not None

    assert w.run_once() is True  # attempt 1 fails
    job = db.get_one(Job, job_id)
    assert (job.status, job.attempts) == (JobStatus.QUEUED, 1)
    assert job.run_after == clock.at + timedelta(seconds=60)
    assert job.last_error == "RuntimeError: FMCSA is down"
    assert w.run_once() is False  # not due yet

    for wait in (60, 120, 240):  # attempts 2, 3, 4
        clock.advance(seconds=wait)
        assert w.run_once() is True

    assert (job.status, job.attempts, len(calls)) == (JobStatus.FAILED, 4, 4)
    assert job.finished_at is not None
    clock.advance(days=1)
    assert w.run_once() is False  # gave up for good


def test_success_records_result(db: Session, clock: Clock) -> None:
    w = worker(db, clock, {"ok": lambda _db, payload: {"echo": payload["n"]}})
    job_id = queue(db, clock).enqueue("ok", {"n": 7})

    assert w.drain() == 1
    job = db.get_one(Job, job_id)
    assert (job.status, job.result, job.locked_by) == (JobStatus.SUCCEEDED, {"echo": 7}, None)


def test_unknown_job_type_fails(db: Session, clock: Clock) -> None:
    job_id = queue(db, clock).enqueue("nope", {})

    worker(db, clock, {}).run_once()

    assert "Unknown job type" in (db.get_one(Job, job_id).last_error or "")


def test_job_of_a_dead_worker_is_requeued(db: Session, clock: Clock) -> None:
    q = queue(db, clock)
    job_id = q.enqueue("ok", {})
    assert q.claim("crashed-worker") is not None

    clock.advance(minutes=10)
    assert q.claim("other") is None  # still within the lock timeout
    clock.advance(minutes=25)
    retaken = q.claim("other")

    assert retaken is not None and retaken.id == job_id
    assert retaken.attempt == 2
    assert db.get_one(Job, job_id).locked_by == "other"


def test_rebuild_signals_job(db: Session, clock: Clock) -> None:
    from app.jobs.handlers import HANDLERS

    make_carrier(db, usdot_number=1234567)
    job_id = queue(db, clock).enqueue(REBUILD_SIGNALS, {"usdot_number": 1234567})

    worker(db, clock, HANDLERS).run_once()

    job = db.get_one(Job, job_id)
    assert job.status == JobStatus.SUCCEEDED
    assert job.result is not None and job.result["usdot_number"] == 1234567
