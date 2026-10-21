"""Messages to and from the reviewing agency on a DataQs case, kept exactly as received.

Only a verified item (`verified_by_id` set) may move the government status or a clock; an
unverified one (e.g. a matched email) waits for a person to confirm it. An agency information
request and the answer to it are what pause and resume the review clock.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsCorrespondenceKind, DataQsCorrespondenceSource, enum_type
from app.models.mixins import IdMixin


class DataQsCorrespondence(IdMixin, Base):
    __tablename__ = "dataqs_correspondence"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("dataqs_review_cycles.id"))
    source: Mapped[DataQsCorrespondenceSource] = mapped_column(
        enum_type(DataQsCorrespondenceSource, "dataqs_correspondence_source")
    )
    kind: Mapped[DataQsCorrespondenceKind] = mapped_column(
        enum_type(DataQsCorrespondenceKind, "dataqs_correspondence_kind")
    )
    inbound: Mapped[bool]  # from the agency (True) or from the requester (False)
    external_id: Mapped[str | None] = mapped_column(String(100))
    original_payload: Mapped[str] = mapped_column(Text)  # the exact text, e.g. the question asked
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    verified_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
