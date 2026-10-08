"""Carrier company officers (spec Section 11.2)."""

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, ObservedPeriodMixin, SourceTraceMixin, UpdatedAtMixin


class Officer(IdMixin, UpdatedAtMixin, ObservedPeriodMixin, SourceTraceMixin, Base):
    __tablename__ = "officers"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), index=True)
    title: Mapped[str | None] = mapped_column(String(100))
    raw_value: Mapped[str | None] = mapped_column(Text)  # original text, e.g. "JOHN DOE PRESIDENT"
