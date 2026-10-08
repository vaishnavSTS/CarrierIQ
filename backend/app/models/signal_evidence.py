"""One piece of evidence behind a signal (spec Section 11.4, Section 13)."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class SignalEvidence(IdMixin, Base):
    __tablename__ = "signal_evidence"

    signal_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("intelligence_signals.id", ondelete="CASCADE"), index=True
    )
    evidence_type: Mapped[str] = mapped_column(String(30))  # e.g. RECORD, COMPARISON, THRESHOLD
    # The record this evidence points at, e.g. ("inspection", 42).
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    raw_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("raw_records.id"), index=True
    )
    field_name: Mapped[str | None] = mapped_column(String(64))
    observed_value: Mapped[str | None] = mapped_column(Text)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str | None] = mapped_column(String(50))
