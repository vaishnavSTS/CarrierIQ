"""A carrier's Estimated ISS as it was at one point in time.

The estimate itself is recalculated from stored inputs whenever it is shown (app/services/
iss_service.py). A snapshot is saved each time that result differs from the carrier's previous
snapshot, so the rows are the carrier's score history: what it was, when, from which FMCSA month
and by which method version. History rows never change.
"""

from datetime import date
from typing import Any

from sqlalchemy import BigInteger, Date, ForeignKey, Index, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class IssSnapshot(IdMixin, Base):
    __tablename__ = "iss_snapshots"
    __table_args__ = (Index("ix_iss_snapshots_carrier_id_created_at", "carrier_id", "created_at"),)

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE")
    )
    value: Mapped[int | None] = mapped_column(SmallInteger)  # 1-100; None: not enough data
    band: Mapped[str | None] = mapped_column(String(10))  # PASS | OPTIONAL | INSPECT
    group: Mapped[int | None] = mapped_column(SmallInteger)  # FMCSA ISS-CSA group 0-13
    algorithm: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    data_month: Mapped[date] = mapped_column(Date)  # FMCSA SMS month of the lookup tables
    version: Mapped[str] = mapped_column(String(20))  # e.g. "iss-est v2.1"
    basics: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)  # per-BASIC results, as shown
