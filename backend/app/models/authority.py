"""Operating authority, one row per docket (spec Section 11.2). MC search joins here."""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DocketPrefix, enum_type
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class Authority(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "authority"
    __table_args__ = (
        UniqueConstraint(
            "carrier_id", "docket_prefix", "docket_number", name="uq_authority_carrier_docket"
        ),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    docket_prefix: Mapped[DocketPrefix] = mapped_column(enum_type(DocketPrefix, "docket_prefix"))
    # Text, not integer: docket numbers are identifiers and may carry leading zeros.
    docket_number: Mapped[str] = mapped_column(String(20), index=True)
    authority_type: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    status_date: Mapped[date | None] = mapped_column(Date)
