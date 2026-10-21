"""DataQs notifications waiting to be delivered (the outbox pattern).

A notification is written in the same transaction as the change that causes it, with a stable
`event_id`, so a retried request or job can never send it twice. A worker delivers PENDING rows,
retries transient failures and keeps the delivery status.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsOutboxStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsOutbox(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_outbox"

    event_id: Mapped[str] = mapped_column(String(100), unique=True)
    case_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("dataqs_cases.id"), index=True)
    recipient_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    channel: Mapped[str] = mapped_column(String(20))  # EMAIL
    kind: Mapped[str] = mapped_column(String(40))  # e.g. "APPEAL_DEADLINE_7_DAYS"
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[DataQsOutboxStatus] = mapped_column(
        enum_type(DataQsOutboxStatus, "dataqs_outbox_status"),
        default=DataQsOutboxStatus.PENDING,
        server_default=DataQsOutboxStatus.PENDING.value,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
