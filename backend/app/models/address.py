"""Carrier physical and mailing addresses, with observed periods (spec Section 11.2)."""

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AddressType, enum_type
from app.models.mixins import IdMixin, ObservedPeriodMixin, SourceTraceMixin, UpdatedAtMixin


class Address(IdMixin, UpdatedAtMixin, ObservedPeriodMixin, SourceTraceMixin, Base):
    __tablename__ = "addresses"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    address_type: Mapped[AddressType] = mapped_column(enum_type(AddressType, "address_type"))
    street: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(50))
    zip: Mapped[str | None] = mapped_column(String(20))
    county_code: Mapped[str | None] = mapped_column(String(10))
    country: Mapped[str | None] = mapped_column(String(50))
    undeliverable: Mapped[bool] = mapped_column(default=False, server_default="false")
