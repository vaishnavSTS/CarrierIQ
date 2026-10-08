"""Insurance filings per docket, current and past (spec Section 11.2, Phase 6).

Current filings (on file with FMCSA) come from Motus when Motus holds the docket, otherwise
from the legacy L&I system as of its freeze date. Past filings (cancelled, replaced, name
changed, transferred) come from both systems' insurance history. Rows are never deleted: a filing
that drops off the current list is kept with `on_file = False`.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DocketPrefix, enum_type
from app.models.mixins import IdMixin, SourceTraceMixin, UpdatedAtMixin


class Insurance(IdMixin, UpdatedAtMixin, SourceTraceMixin, Base):
    __tablename__ = "insurance"
    __table_args__ = (Index("ix_insurance_carrier_docket", "carrier_id", "docket_number"),)

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    docket_prefix: Mapped[DocketPrefix | None] = mapped_column(
        enum_type(DocketPrefix, "docket_prefix")
    )
    docket_number: Mapped[str | None] = mapped_column(String(20))
    insurer: Mapped[str | None] = mapped_column(String(255))
    # BIPD | CARGO | BOND | TRUST_FUND
    insurance_type: Mapped[str | None] = mapped_column(String(50))
    insurance_class: Mapped[str | None] = mapped_column(String(10))  # P | E | 1 | 2 (dictionary)
    form_code: Mapped[str | None] = mapped_column(String(10))  # e.g. 91X, 34 (without "BMC-")
    coverage_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))  # dollars
    underlying_limit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))  # dollars
    policy_number: Mapped[str | None] = mapped_column(String(100))
    effective_date: Mapped[date | None] = mapped_column(Date)
    termination_date: Mapped[date | None] = mapped_column(Date)  # cancellation effective date
    # ON_FILE for current filings; CANCELLED | REPLACED | NAME_CHANGED | TRANSFERRED for past ones.
    status: Mapped[str | None] = mapped_column(String(50))
    on_file: Mapped[bool] = mapped_column(default=False, server_default="false")
    received_date: Mapped[date | None] = mapped_column(Date)  # when FMCSA received it (Motus)
    source_system: Mapped[str | None] = mapped_column(String(20))  # MOTUS | LEGACY_LI
    status_as_of: Mapped[date | None] = mapped_column(Date)
