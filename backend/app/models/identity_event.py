"""Identity events such as ownership attestations (spec Section 11.3, Section 29).

Event -> Correction -> Current State: a correction is a new row pointing at the event it
corrects (`corrects_event_id`); the original is never deleted.
"""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class IdentityEvent(IdMixin, Base):
    __tablename__ = "identity_events"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(50))  # e.g. OWNERSHIP_CHANGE_ATTESTED
    platform: Mapped[str | None] = mapped_column(String(100))  # where it happened, e.g. Highway
    event_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    corrects_event_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("identity_events.id"), index=True
    )
    supporting_document: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(50), default="manual", server_default="manual")
    entered_by: Mapped[str | None] = mapped_column(String(255))
