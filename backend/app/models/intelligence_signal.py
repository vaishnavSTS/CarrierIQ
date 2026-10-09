"""A deterministic intelligence signal (spec Section 11.4, Section 12).

`rule_id` + `rule_version` answer "how was this calculated?" even after a rule changes.
A signal must never be saved without at least one signal_evidence row; the signal
service enforces that (Section 13.2).

`signal_key` is the signal's stable identity within its carrier (e.g. "shared_vin:888"), so
re-running a rule updates the signal and keeps its review status instead of duplicating it. A
signal the rule no longer produces is kept with `is_active` false: a reviewer's decision about it
stays on record.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Confidence, Severity, SignalStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class IntelligenceSignal(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "intelligence_signals"
    __table_args__ = (
        UniqueConstraint("carrier_id", "signal_key", name="uq_intelligence_signals_carrier_key"),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    signal_type: Mapped[str] = mapped_column(String(50), index=True)  # e.g. SHARED_VIN
    signal_key: Mapped[str | None] = mapped_column(String(200))
    rule_id: Mapped[str] = mapped_column(String(50))  # e.g. "shared_vin"
    rule_version: Mapped[str] = mapped_column(String(20))  # e.g. "1.0"
    severity: Mapped[Severity] = mapped_column(enum_type(Severity, "severity"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[Confidence] = mapped_column(enum_type(Confidence, "confidence"))
    status: Mapped[SignalStatus] = mapped_column(
        enum_type(SignalStatus, "signal_status"),
        default=SignalStatus.OPEN,
        server_default=SignalStatus.OPEN.value,
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    first_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
