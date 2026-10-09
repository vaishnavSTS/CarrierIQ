"""Background job status (spec Phase 10)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class JobOut(BaseModel):
    id: int
    job_type: str  # refresh_carrier | rebuild_signals
    payload: dict[str, Any]
    status: str  # QUEUED | RUNNING | SUCCEEDED | FAILED
    attempts: int
    max_attempts: int
    run_after: datetime  # for a QUEUED retry: when it will run
    locked_by: str | None
    last_error: str | None
    result: dict[str, Any] | None
    created_at: datetime
    finished_at: datetime | None


class WorkerOut(BaseModel):
    worker: str
    started_at: datetime
    last_seen_at: datetime


class JobsOverviewOut(BaseModel):
    counts: dict[str, int]  # by status
    worker_running: bool  # a worker checked in recently
    workers: list[WorkerOut]  # most recently seen first
    jobs: list[JobOut]  # newest first


class RefreshQueuedOut(BaseModel):
    queued: bool  # False: a refresh for this carrier was already waiting or running
    job: JobOut | None
