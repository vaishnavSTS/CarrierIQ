"""DataQs deadlines and the pauses in them.

A clock stores the event it counts from (`base_event`, `base_at`) and how its due date was derived
(`policy_version`, `authority_source`, `confidence`), so a deadline can always be explained. Base
times are never edited; a staff override records who and why. Pauses (an agency information request
until the requester's answer) are separate rows: overlapping pauses are merged when the remaining
time is computed, so no time is subtracted twice.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Confidence, DataQsClockType, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsClock(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_clocks"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("dataqs_review_cycles.id"))
    clock_type: Mapped[DataQsClockType] = mapped_column(
        enum_type(DataQsClockType, "dataqs_clock_type")
    )
    base_event: Mapped[str] = mapped_column(String(50))  # e.g. "submission_confirmed"
    base_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str | None] = mapped_column(String(50))  # the government's original zone
    policy_version: Mapped[str] = mapped_column(String(20))
    authority_source: Mapped[str | None] = mapped_column(String(200))  # e.g. "[S3] DataQs Help"
    budget_days: Mapped[int | None] = mapped_column(Integer)  # calendar days
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confidence: Mapped[Confidence] = mapped_column(enum_type(Confidence, "confidence"))
    override_reason: Mapped[str | None] = mapped_column(Text)
    overridden_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class DataQsClockPause(IdMixin, Base):
    __tablename__ = "dataqs_clock_pauses"

    clock_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_clocks.id", ondelete="CASCADE"), index=True
    )
    paused_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    start_correspondence_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("dataqs_correspondence.id")
    )
    end_correspondence_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("dataqs_correspondence.id")
    )
