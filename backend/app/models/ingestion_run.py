"""One fetch from an external source (spec Section 11.5)."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import IngestionStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class IngestionRun(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "ingestion_runs"

    source: Mapped[str] = mapped_column(String(50))
    dataset_id: Mapped[str | None] = mapped_column(String(50))
    query: Mapped[str | None] = mapped_column(Text)  # e.g. "dot_number=1234567"
    status: Mapped[IngestionStatus] = mapped_column(
        enum_type(IngestionStatus, "ingestion_status"), default=IngestionStatus.RUNNING
    )
    records_fetched: Mapped[int] = mapped_column(default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
