"""An event on a carrier's federal timeline (spec Section 11.4, Section 12.7).

Events are derived from stored records and rebuilt when a carrier refreshes. `event_key` is the
event's stable identity (e.g. "authority:MC139446:REVOKED:2021-06-08"), so a rebuild updates an
event instead of duplicating it.
"""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Severity, enum_type
from app.models.mixins import IdMixin


class TimelineEvent(IdMixin, Base):
    __tablename__ = "timeline_events"
    __table_args__ = (
        Index("ix_timeline_events_carrier_date", "carrier_id", "event_date"),
        UniqueConstraint("carrier_id", "event_key", name="uq_timeline_events_carrier_key"),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE")
    )
    event_type: Mapped[str] = mapped_column(String(50))
    event_key: Mapped[str | None] = mapped_column(String(200))
    event_date: Mapped[date] = mapped_column(Date)
    severity: Mapped[Severity] = mapped_column(enum_type(Severity, "severity"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    signal_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("intelligence_signals.id", ondelete="SET NULL"), index=True
    )
    raw_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("raw_records.id"), index=True
    )
