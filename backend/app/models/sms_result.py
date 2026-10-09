"""FMCSA SMS (CSA) results: one row per carrier, BASIC and monthly snapshot.

Values exactly as FMCSA publishes them. Percentile and alerts exist only in the passenger
files; property carriers have measures and the acute/critical indicator only. A row per month
builds the carrier's SMS history as CarrierIQ fetches it.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class SmsResult(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "sms_results"
    __table_args__ = (
        UniqueConstraint("carrier_id", "snapshot_month", "basic", name="uq_sms_results_month"),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    snapshot_month: Mapped[date] = mapped_column(Date)  # first day of the month fetched
    dataset_id: Mapped[str] = mapped_column(String(20))
    dataset: Mapped[str] = mapped_column(String(50))  # e.g. SMS AB PassProperty
    passenger: Mapped[bool]
    inspections: Mapped[int]  # carrier totals for the 24-month period
    driver_inspections: Mapped[int]
    vehicle_inspections: Mapped[int]
    basic: Mapped[str] = mapped_column(String(20))  # e.g. unsafe_driv
    label: Mapped[str] = mapped_column(String(60))
    inspections_with_violation: Mapped[int]
    measure: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    over_threshold: Mapped[bool | None]
    alert: Mapped[bool | None]
    acute_critical: Mapped[bool | None]
    note: Mapped[str | None] = mapped_column(String(200))
