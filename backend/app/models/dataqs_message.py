"""Emails STS sends a carrier about a DataQs case, kept on the case for both sides to see.

STS staff write some (e.g. what else is needed); others the app writes at key steps (evidence
needed, package ready to approve, filed, decision, file closed: `author_id` None). Each message is
delivered through the outbox (dataqs_outbox, `outbox_event_id`), so a failed email can be retried
and never stops the case from moving.
"""

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class DataQsMessage(IdMixin, Base):
    __tablename__ = "dataqs_messages"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[int | None] = mapped_column(  # None: written by the app
        BigInteger, ForeignKey("users.id")
    )
    kind: Mapped[str] = mapped_column(String(40))  # MESSAGE, EVIDENCE_NEEDED, FILE_CLOSED, ...
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    recipients: Mapped[list[str]] = mapped_column(JSONB)  # email addresses at the time it was sent
    outbox_event_id: Mapped[str] = mapped_column(String(100))
