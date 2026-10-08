"""A vehicle identified by VIN, with its cached NHTSA vPIC decode (spec Section 11.2).

Which carriers a VIN was seen with lives in `relationships` (VIN_OBSERVED_WITH).
"""

from datetime import datetime

from sqlalchemy import DateTime, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, UpdatedAtMixin


class Vehicle(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "vehicles"

    vin: Mapped[str] = mapped_column(String(17), unique=True)
    decoded_make: Mapped[str | None] = mapped_column(String(100))
    decoded_model: Mapped[str | None] = mapped_column(String(100))
    decoded_year: Mapped[int | None] = mapped_column(SmallInteger)
    decoded_body_class: Mapped[str | None] = mapped_column(String(100))
    decoded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
