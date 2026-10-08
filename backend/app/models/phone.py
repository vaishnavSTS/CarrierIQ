"""Carrier phone numbers (spec Section 11.2). Normalized digits allow cross-carrier matching."""

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PhoneType, enum_type
from app.models.mixins import IdMixin, ObservedPeriodMixin, SourceTraceMixin, UpdatedAtMixin


class Phone(IdMixin, UpdatedAtMixin, ObservedPeriodMixin, SourceTraceMixin, Base):
    __tablename__ = "phones"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    phone_type: Mapped[PhoneType] = mapped_column(enum_type(PhoneType, "phone_type"))
    number_normalized: Mapped[str] = mapped_column(String(20), index=True)  # digits only
