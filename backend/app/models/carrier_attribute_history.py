"""Field-level carrier history (spec Section 11.3, Section 20).

Values are never updated in place: a change closes the current row (`valid_to`) and opens a new one.
"What did this carrier look like on date X?" is
`valid_from <= X AND (valid_to IS NULL OR valid_to > X)`.
"""

from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin


class CarrierAttributeHistory(IdMixin, SourceTraceMixin, Base):
    __tablename__ = "carrier_attribute_history"
    __table_args__ = (
        Index("ix_carrier_attribute_history_lookup", "carrier_id", "attribute", "valid_from"),
        # At most one open (current) value per carrier attribute.
        Index(
            "uq_carrier_attribute_history_current",
            "carrier_id",
            "attribute",
            unique=True,
            postgresql_where=text("valid_to IS NULL"),
        ),
        CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="valid_period"),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE")
    )
    attribute: Mapped[str] = mapped_column(String(64))  # e.g. legal_name, email, fleet_size
    value: Mapped[str | None] = mapped_column(Text)
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)  # NULL = current value
