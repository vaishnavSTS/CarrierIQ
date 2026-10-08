"""Whole-record hash per refresh (spec Section 11.3). Field-level changes live in history."""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin


class CarrierSnapshot(IdMixin, SourceTraceMixin, Base):
    __tablename__ = "carrier_snapshots"
    __table_args__ = (Index("ix_carrier_snapshots_carrier_date", "carrier_id", "snapshot_date"),)

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE")
    )
    snapshot_date: Mapped[date] = mapped_column(Date)
    data_hash: Mapped[str] = mapped_column(String(64))  # SHA-256 hex
