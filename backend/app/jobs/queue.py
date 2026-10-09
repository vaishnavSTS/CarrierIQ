"""The job queue (spec Section 18): an interface, and its PostgreSQL implementation.

Callers depend on `JobQueue` only, so a Redis, RabbitMQ or cloud queue can replace
`PostgresJobQueue` later without touching the handlers or the intelligence logic.

Retries: a failed job goes back to QUEUED with `run_after` pushed out exponentially
(base, 2x base, 4x base, ...) until `max_attempts`; then it is FAILED and keeps its last error.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Job
from app.models.enums import JobStatus


@dataclass(frozen=True)
class ClaimedJob:
    id: int
    job_type: str
    payload: dict[str, Any]
    attempt: int  # 1 for the first try
    max_attempts: int


class JobQueue(Protocol):
    def enqueue(
        self, job_type: str, payload: dict[str, Any], dedupe_key: str | None = None
    ) -> int | None:
        """Add a job; returns its id, or None if a job with this dedupe key is pending."""

    def claim(self, worker: str) -> ClaimedJob | None:
        """Take the next due job for `worker`, or None when nothing is due."""

    def complete(self, job_id: int, result: dict[str, Any]) -> None: ...

    def fail(self, job_id: int, error: str) -> JobStatus:
        """Record a failure; returns QUEUED (will retry) or FAILED (gave up)."""


class PostgresJobQueue:
    def __init__(
        self,
        db: Session,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        settings = get_settings()
        self.db = db
        self.now = now
        self.max_attempts = settings.job_max_attempts
        self.retry_base = timedelta(seconds=settings.job_retry_base_seconds)
        self.lock_timeout = timedelta(minutes=settings.job_lock_timeout_minutes)

    def enqueue(
        self, job_type: str, payload: dict[str, Any], dedupe_key: str | None = None
    ) -> int | None:
        job = Job(
            job_type=job_type,
            payload=payload,
            dedupe_key=dedupe_key,
            max_attempts=self.max_attempts,
            run_after=self.now(),
        )
        try:
            with self.db.begin_nested():  # a duplicate pending key only undoes this insert
                self.db.add(job)
                self.db.flush()
        except IntegrityError:
            return None
        self.db.commit()
        return job.id

    def claim(self, worker: str) -> ClaimedJob | None:
        now = self.now()
        self._release_abandoned(now)
        job = self.db.scalars(
            select(Job)
            .where(Job.status == JobStatus.QUEUED, Job.run_after <= now)
            .order_by(Job.run_after, Job.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        ).first()
        if job is None:
            self.db.commit()
            return None
        job.status = JobStatus.RUNNING
        job.attempts += 1
        job.locked_by = worker
        job.locked_at = now
        claimed = ClaimedJob(
            job.id, job.job_type, dict(job.payload), job.attempts, job.max_attempts
        )
        self.db.commit()
        return claimed

    def complete(self, job_id: int, result: dict[str, Any]) -> None:
        job = self.db.get_one(Job, job_id)
        job.status = JobStatus.SUCCEEDED
        job.result = result
        job.last_error = None
        job.finished_at = self.now()
        job.locked_by = job.locked_at = None
        self.db.commit()

    def fail(self, job_id: int, error: str) -> JobStatus:
        job = self.db.get_one(Job, job_id)
        job.last_error = error[:4000]
        job.locked_by = job.locked_at = None
        if job.attempts >= job.max_attempts:
            job.status = JobStatus.FAILED
            job.finished_at = self.now()
        else:
            job.status = JobStatus.QUEUED
            job.run_after = self.now() + self.retry_base * 2 ** (job.attempts - 1)
        self.db.commit()
        return job.status

    def _release_abandoned(self, now: datetime) -> None:
        """Requeue RUNNING jobs whose worker died (locked longer than the lock timeout)."""
        self.db.execute(
            update(Job)
            .where(
                Job.status == JobStatus.RUNNING,
                or_(Job.locked_at.is_(None), Job.locked_at < now - self.lock_timeout),
            )
            .values(
                status=JobStatus.QUEUED,
                locked_by=None,
                locked_at=None,
                last_error="Worker stopped while running the job; requeued",
                run_after=now,
            )
        )
