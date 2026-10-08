"""Source data exactly as received (spec Section 11.1, Layer 1). Never modified after insert."""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class RawRecord(IdMixin, Base):
    __tablename__ = "raw_records"
    __table_args__ = (
        # "Latest raw record for this source key", used for change detection.
        Index("ix_raw_records_source_key", "source", "dataset_id", "external_id"),
    )

    source: Mapped[str] = mapped_column(String(50))  # e.g. "dot_socrata", "nhtsa_vpic", "manual"
    dataset_id: Mapped[str | None] = mapped_column(String(50))  # e.g. "az4n-8mr2"
    external_id: Mapped[str] = mapped_column(String(100))  # e.g. USDOT number, inspection ID
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    payload_hash: Mapped[str] = mapped_column(String(64))  # SHA-256 hex
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ingestion_run_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("ingestion_runs.id"), index=True
    )
