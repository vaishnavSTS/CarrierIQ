"""Violations FMCSA counts in a carrier's SMS (CSA) measures, from FMCSA's "SMS Input -
Violation" file, with FMCSA's own weights.

The file is FMCSA's current 24-month measurement input, so a carrier's rows are replaced on
every fetch: a violation that has aged out of the period disappears, as it does from SMS.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin


class SmsViolation(IdMixin, SourceTraceMixin, Base):
    __tablename__ = "sms_violations"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    inspection_id: Mapped[str] = mapped_column(String(30))  # FMCSA unique_id
    inspection_date: Mapped[date] = mapped_column(Date)
    code: Mapped[str] = mapped_column(String(30))
    basic: Mapped[str] = mapped_column(String(60))  # e.g. Vehicle Maintenance
    group: Mapped[str | None] = mapped_column(String(100))  # e.g. Tires
    description: Mapped[str | None] = mapped_column(String(300))
    unit: Mapped[str | None] = mapped_column(String(5))  # 1, 2 (vehicle units), D, C (driver)
    out_of_service: Mapped[bool]
    severity_weight: Mapped[int]
    time_weight: Mapped[int]
    total_weight: Mapped[Decimal] = mapped_column(Numeric(8, 2))  # FMCSA total severity weight
