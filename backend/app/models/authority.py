"""Operating authority, one row per docket (spec Section 11.2). MC search joins here.

The census lists every docket, but its docket status is NOT the operating-authority status: it
shows "A" for dockets whose authority was revoked (checked on 2026-10-08, e.g. MC161790,
MC196779). The operating-authority status comes from Motus (current) or, when Motus doesn't
hold the docket, the legacy L&I system (frozen on 2026-05-14); the census docket status is
used only when neither has the docket. `status_source` / `status_as_of` say where the status
came from and how current it is.
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
