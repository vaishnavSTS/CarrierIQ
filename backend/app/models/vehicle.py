"""A vehicle identified by VIN, with its cached NHTSA vPIC decode (spec Sections 8.4, 11.2).

The decode enriches the vehicle; it is never a risk judgement on its own (spec 8.4).

Which carriers a VIN was seen with lives in `relationships` (VIN_OBSERVED_WITH).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, SmallInteger, String, Text
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
    decoded_vehicle_type: Mapped[str | None] = mapped_column(String(100))  # e.g. TRUCK, TRAILER
    decoded_gvwr: Mapped[str | None] = mapped_column(String(100))  # weight class text
    decoded_manufacturer: Mapped[str | None] = mapped_column(String(200))
    # vPIC ErrorCode, e.g. "0" (clean), "1" (check digit wrong), "1,7,11,400" (several issues).
    decode_error_code: Mapped[str | None] = mapped_column(String(50))
    decode_error_text: Mapped[str | None] = mapped_column(Text)
    check_digit_valid: Mapped[bool | None]  # False when vPIC reports error 1
    decoded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decode_raw_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("raw_records.id"), index=True
    )
