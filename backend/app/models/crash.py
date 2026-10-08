"""Reported crashes (spec Section 11.2)."""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class Crash(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "crashes"
    __table_args__ = (UniqueConstraint("source", "crash_id", name="uq_crashes_source_crash_id"),)

    crash_id: Mapped[str] = mapped_column(String(50))  # source report number
    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    crash_date: Mapped[date] = mapped_column(Date, index=True)
    state: Mapped[str | None] = mapped_column(String(10))
    fatalities: Mapped[int] = mapped_column(default=0, server_default="0")
    injuries: Mapped[int] = mapped_column(default=0, server_default="0")
    tow_away: Mapped[bool] = mapped_column(default=False, server_default="false")
    vin: Mapped[str | None] = mapped_column(String(17), index=True)
