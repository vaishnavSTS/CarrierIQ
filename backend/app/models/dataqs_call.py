"""A call the carrier booked with their STS specialist about a DataQs case (questions, evidence,
the decision). One booked call per case at a time: moving it updates the same row, so its calendar
entry (same UID, higher `sequence`) replaces the old one."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsCallStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsCall(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_calls"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    booked_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    phone: Mapped[str] = mapped_column(String(20))  # E.164, e.g. +12095550123
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    time_zone: Mapped[str] = mapped_column(String(64))  # the booker's, for emails and texts
    topic: Mapped[str | None] = mapped_column(Text)
    status: Mapped[DataQsCallStatus] = mapped_column(
        enum_type(DataQsCallStatus, "dataqs_call_status"),
        default=DataQsCallStatus.BOOKED,
        server_default=DataQsCallStatus.BOOKED.value,
    )
    sequence: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # moves
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
