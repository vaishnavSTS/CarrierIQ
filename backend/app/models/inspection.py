"""Roadside inspections (spec Section 11.2)."""

from datetime import date
from typing import Any

from sqlalchemy import BigInteger, Date, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class Inspection(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "inspections"
    __table_args__ = (
        UniqueConstraint("source", "inspection_id", name="uq_inspections_source_inspection_id"),
    )

    inspection_id: Mapped[str] = mapped_column(String(50))  # source inspection report number
    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    vin: Mapped[str | None] = mapped_column(String(17), index=True)
    inspection_date: Mapped[date] = mapped_column(Date, index=True)
    inspection_level: Mapped[int | None] = mapped_column(SmallInteger)
    state: Mapped[str | None] = mapped_column(String(10))
    location: Mapped[str | None] = mapped_column(String(255))
    vehicle_oos: Mapped[bool] = mapped_column(default=False, server_default="false")
    driver_oos: Mapped[bool] = mapped_column(default=False, server_default="false")
    violation_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
