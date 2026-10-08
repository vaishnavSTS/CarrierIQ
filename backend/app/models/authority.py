"""Operating authority, one row per docket (spec Section 11.2). MC search joins here.

The census gives every docket and a daily status; FMCSA's operating-authority data (Motus, or
the legacy L&I system frozen on 2026-05-14) adds the authority type, insurance requirements and
the authoritative status. `status_source` / `status_as_of` say where the current status came
from, so a frozen legacy status is never mistaken for today's.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Numeric, String, UniqueConstraint
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
    authority_type: Mapped[str | None] = mapped_column(String(150))
    status: Mapped[str | None] = mapped_column(String(50))
    status_date: Mapped[date | None] = mapped_column(Date)
    status_source: Mapped[str | None] = mapped_column(String(20))  # CENSUS | MOTUS | LEGACY_LI
    status_as_of: Mapped[date | None] = mapped_column(Date)
    # Insurance requirements and what is on file (FMCSA operating-authority data), in dollars.
    bipd_required: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    bipd_on_file: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    cargo_required: Mapped[bool | None]
    cargo_on_file: Mapped[bool | None]
    bond_required: Mapped[bool | None]
    bond_on_file: Mapped[bool | None]
    revocation_pending: Mapped[bool | None]
