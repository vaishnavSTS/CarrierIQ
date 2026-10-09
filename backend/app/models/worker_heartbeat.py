"""When each background worker last checked in, so the app can tell whether one is running."""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class WorkerHeartbeat(IdMixin, Base):
    __tablename__ = "worker_heartbeats"

    worker: Mapped[str] = mapped_column(String(100), unique=True)  # host:pid
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
