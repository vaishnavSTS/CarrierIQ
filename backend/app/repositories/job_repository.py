"""Read access to jobs and worker heartbeats (job status, spec Phase 10)."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Job, WorkerHeartbeat
from app.models.enums import JobStatus


class JobRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, job_id: int) -> Job | None:
        return self.db.get(Job, job_id)

    def recent(self, limit: int, status: JobStatus | None = None) -> list[Job]:
        """Newest first."""
        query = select(Job).order_by(Job.created_at.desc(), Job.id.desc()).limit(limit)
        if status is not None:
            query = query.where(Job.status == status)
        return list(self.db.scalars(query))

    def counts(self) -> dict[JobStatus, int]:
        found = {status: 0 for status in JobStatus}
        for status, n in self.db.execute(select(Job.status, func.count()).group_by(Job.status)):
            found[status] = n
        return found

    def heartbeats(self) -> list[WorkerHeartbeat]:
        """Most recently seen first."""
        return list(
            self.db.scalars(select(WorkerHeartbeat).order_by(WorkerHeartbeat.last_seen_at.desc()))
        )

    def beat(self, worker: str, started_at: datetime, now: datetime) -> None:
        self.db.execute(
            insert(WorkerHeartbeat)
            .values(worker=worker, started_at=started_at, last_seen_at=now)
            .on_conflict_do_update(index_elements=["worker"], set_={"last_seen_at": now})
        )
        self.db.commit()
