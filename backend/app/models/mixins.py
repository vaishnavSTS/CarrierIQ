"""Columns shared by many tables (spec Section 11 conventions)."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, func, true
from sqlalchemy.orm import Mapped, mapped_column


class IdMixin:
    """Every table has `id` and `created_at`."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, sort_order=-100)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), sort_order=100
    )


class UpdatedAtMixin:
    """For tables whose rows can change. History rows never change, so they don't use this."""

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), sort_order=101
    )


class SourceTraceMixin:
    """Source traceability (Principle 5): the source and raw record a row came from."""

    source: Mapped[str] = mapped_column(String(50), sort_order=90)
    raw_record_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("raw_records.id"), index=True, sort_order=91
    )


class ObservedPeriodMixin:
    """When a value was first and last observed in the source, and whether it is still current."""

    first_seen: Mapped[date] = mapped_column(Date, sort_order=80)
    last_seen: Mapped[date] = mapped_column(Date, sort_order=81)
    is_current: Mapped[bool] = mapped_column(default=True, server_default=true(), sort_order=82)
