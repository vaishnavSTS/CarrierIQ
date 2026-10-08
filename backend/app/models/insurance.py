"""Insurance filings (spec Section 11.2)."""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class Insurance(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "insurance"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    insurer: Mapped[str | None] = mapped_column(String(255))
    insurance_type: Mapped[str | None] = mapped_column(String(50))
    coverage_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    policy_number: Mapped[str | None] = mapped_column(String(100))
    effective_date: Mapped[date | None] = mapped_column(Date)
    termination_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String(50))
