"""Every change to a DataQs case, append-only: who did what, and the values before and after.

Written in the same transaction as the change itself (dataqs_case_repository.audit), so a change
never lands without its audit row. Rows are never updated or deleted.
"""

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class DataQsAuditEvent(IdMixin, Base):
    __tablename__ = "dataqs_audit_events"

    case_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("dataqs_cases.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(  # None: the system (e.g. a background job)
        BigInteger, ForeignKey("users.id")
    )
    action: Mapped[str] = mapped_column(String(60))  # e.g. "case.created", "work_status.changed"
    case_row_version: Mapped[int | None] = mapped_column(Integer)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
