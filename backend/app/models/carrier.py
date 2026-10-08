"""Canonical carrier identity (spec Section 11.2).

Holds current values for fast display. Every change is also written to carrier_attribute_history.
"""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, UpdatedAtMixin


class Carrier(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "carriers"
    __table_args__ = (
        # Trigram indexes for fuzzy name search (requires pg_trgm, migration 0001).
        Index(
            "ix_carriers_legal_name_trgm",
            "legal_name",
            postgresql_using="gin",
            postgresql_ops={"legal_name": "gin_trgm_ops"},
        ),
        Index(
            "ix_carriers_dba_name_trgm",
            "dba_name",
            postgresql_using="gin",
            postgresql_ops={"dba_name": "gin_trgm_ops"},
        ),
    )

    usdot_number: Mapped[int] = mapped_column(BigInteger, unique=True)
    legal_name: Mapped[str] = mapped_column(String(255))
    dba_name: Mapped[str | None] = mapped_column(String(255))
    entity_type: Mapped[str | None] = mapped_column(String(10))  # census `carship` (C, B, F, ...)
    # Census `status_code`, normalized (ACTIVE | INACTIVE | PENDING). Kept as text so an
    # unexpected source code is stored rather than rejected.
    registration_status: Mapped[str | None] = mapped_column(String(20))
    # Census CLASSDEF, ";"-separated (e.g. "PRIVATE PROPERTY;AUTHORIZED FOR HIRE"). Only
    # "AUTHORIZED FOR HIRE" needs for-hire operating authority, and with it FMCSA insurance filings.
    operation_classification: Mapped[str | None] = mapped_column(String(300))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    fleet_size: Mapped[int | None]  # census `power_units`
    driver_count: Mapped[int | None]  # census `total_drivers`
    safety_rating: Mapped[str | None] = mapped_column(String(20))
    safety_rating_date: Mapped[date | None] = mapped_column(Date)
    first_registered_date: Mapped[date | None] = mapped_column(Date)
    last_mcs150_date: Mapped[date | None] = mapped_column(Date)
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
