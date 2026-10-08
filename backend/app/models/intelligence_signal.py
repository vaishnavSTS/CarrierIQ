"""A deterministic intelligence signal (spec Section 11.4, Section 12).

`rule_id` + `rule_version` answer "how was this calculated?" even after a rule changes.
A signal must never be saved without at least one signal_evidence row; the signal
service enforces that (Section 13.2).
"""

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Confidence, Severity, SignalStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class IntelligenceSignal(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "intelligence_signals"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    signal_type: Mapped[str] = mapped_column(String(50), index=True)  # e.g. SHARED_VIN
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
