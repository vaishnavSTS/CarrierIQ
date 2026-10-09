"""A unit of background work, e.g. "refresh USDOT 295017" (spec Section 18, Phase 10).

The queue lives in PostgreSQL: workers claim jobs with SELECT ... FOR UPDATE SKIP LOCKED, so
several workers never take the same job and no extra service (Redis, RabbitMQ) is needed yet.
`dedupe_key` (e.g. "refresh_carrier:295017") keeps at most one waiting or running job per key.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import JobStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class Job(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_status_run_after", "status", "run_after"),
        Index(
            "uq_jobs_pending_dedupe_key",
            "dedupe_key",
            unique=True,
            postgresql_where=text("status IN ('QUEUED', 'RUNNING')"),
        ),
    )

    job_type: Mapped[str] = mapped_column(String(50))  # e.g. refresh_carrier
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[JobStatus] = mapped_column(
        enum_type(JobStatus, "job_status"),
        default=JobStatus.QUEUED,
        server_default=JobStatus.QUEUED.value,
    )
    attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(default=4, server_default="4")
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    locked_by: Mapped[str | None] = mapped_column(String(100))  # worker name
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
