"""Dated operating-authority actions per docket: granted, revoked, reinstated, suspended, ...

Rows come from Motus AuthHist and the legacy L&I AuthHist (one legacy row can hold two actions:
the original action and its disposition). Rows are facts from the source and never change.
"""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DocketPrefix, enum_type
from app.models.mixins import IdMixin, SourceTraceMixin


class AuthorityHistory(IdMixin, SourceTraceMixin, Base):
    __tablename__ = "authority_history"
    __table_args__ = (
        # One raw row yields at most one event per kind (ORIGINAL / DISPOSITION / STATUS).
        UniqueConstraint("raw_record_id", "event_kind", name="uq_authority_history_raw_kind"),
        Index("ix_authority_history_carrier_date", "carrier_id", "action_date"),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE")
    )
    docket_prefix: Mapped[DocketPrefix] = mapped_column(enum_type(DocketPrefix, "docket_prefix"))
    docket_number: Mapped[str] = mapped_column(String(20))
    authority_type: Mapped[str | None] = mapped_column(String(150))
    event_kind: Mapped[str] = mapped_column(String(20))  # STATUS (Motus) | ORIGINAL | DISPOSITION
    action: Mapped[str] = mapped_column(String(150))  # e.g. GRANTED, REVOKED, REINSTATED
    status: Mapped[str | None] = mapped_column(String(50))  # Motus status after the action
    reason: Mapped[str | None] = mapped_column(Text)  # Motus status-change reason
    action_date: Mapped[date | None] = mapped_column(Date)
    source_system: Mapped[str] = mapped_column(String(20))  # MOTUS | LEGACY_LI
