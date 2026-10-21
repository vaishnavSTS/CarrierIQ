"""One government review cycle of a DataQs case: INITIAL, RECONSIDERATION or FINAL.

A cycle starts only on a confirmed request for that stage. Appeals and reopenings add a new cycle
linked to the one before (`parent_cycle_id`); earlier cycles, their decisions and receipts are never
overwritten. `decided_by` records the government reviewer, so STS can flag a reconsideration or
final review decided by someone who took part earlier.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsOutcome, DataQsReviewLevel, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsReviewCycle(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_review_cycles"
    __table_args__ = (
        UniqueConstraint(
            "case_id", "level", "cycle_number", name="uq_dataqs_review_cycles_case_level_number"
        ),
    )

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[DataQsReviewLevel] = mapped_column(
        enum_type(DataQsReviewLevel, "dataqs_review_level")
    )
    cycle_number: Mapped[int] = mapped_column(Integer)  # 1, then 2 after a reopening
    parent_cycle_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("dataqs_review_cycles.id")
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[DataQsOutcome | None] = mapped_column(
        enum_type(DataQsOutcome, "dataqs_outcome", length=30)
    )
    decided_by: Mapped[str | None] = mapped_column(String(200))
    decision: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # reasons, appeal instructions
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
