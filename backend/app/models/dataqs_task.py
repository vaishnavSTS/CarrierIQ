"""DataQs work items: what someone has to do on a case, and by when.

Tasks are created in the app first; email reminders (dataqs_outbox) only prompt people to look at
them, so a failed email never loses the task.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsActionOwner, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsTask(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_tasks"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))  # e.g. "ANSWER_INFO_REQUEST"
    title: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str | None] = mapped_column(Text)
    action_owner: Mapped[DataQsActionOwner] = mapped_column(
        enum_type(DataQsActionOwner, "dataqs_action_owner")
    )
    assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    clock_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("dataqs_clocks.id"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
