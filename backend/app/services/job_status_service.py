"""Job status and on-demand job requests (spec Phase 10)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.jobs.handlers import REFRESH_CARRIER, refresh_dedupe_key
from app.jobs.queue import JobQueue
from app.models import Job
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository
from app.schemas.jobs import JobOut, JobsOverviewOut, RefreshQueuedOut, WorkerOut


class JobNotFoundError(NotFoundError):
    code = "job_not_found"


class JobStatusService:
    def __init__(
        self,
        db: Session,
        jobs: JobRepository,
        queue: JobQueue,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.jobs = jobs
        self.queue = queue
        self.now = now

    def overview(self, limit: int, status: JobStatus | None = None) -> JobsOverviewOut:
        # A worker that missed three check-ins is treated as stopped.
        alive_after = self.now() - 3 * timedelta(seconds=get_settings().worker_heartbeat_seconds)
        workers = self.jobs.heartbeats()
        return JobsOverviewOut(
            counts={s.value: n for s, n in self.jobs.counts().items()},
            worker_running=any(w.last_seen_at >= alive_after for w in workers),
            workers=[
                WorkerOut(worker=w.worker, started_at=w.started_at, last_seen_at=w.last_seen_at)
                for w in workers
            ],
            jobs=[job_out(j) for j in self.jobs.recent(limit, status)],
        )

    def get(self, job_id: int) -> JobOut:
        job = self.jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(f"No job with id {job_id}")
        return job_out(job)

    def queue_refresh(self, usdot_number: int) -> RefreshQueuedOut:
        """Queue a forced refresh; if one is already waiting or running, return that one."""
        key = refresh_dedupe_key(usdot_number)
        job_id = self.queue.enqueue(
            REFRESH_CARRIER, {"usdot_number": usdot_number, "force": True}, key
        )
        if job_id is not None:
            return RefreshQueuedOut(queued=True, job=self.get(job_id))
        pending = self.db.scalars(
            select(Job).where(
                Job.dedupe_key == key, Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING])
            )
        ).first()
        return RefreshQueuedOut(queued=False, job=job_out(pending) if pending else None)


def job_out(job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        job_type=job.job_type,
        payload=job.payload,
        status=job.status.value,
        attempts=job.attempts,
        max_attempts=job.max_attempts,
        run_after=job.run_after,
        locked_by=job.locked_by,
        last_error=job.last_error,
        result=job.result,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
