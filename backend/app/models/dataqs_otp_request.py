"""One request to a carrier for the FMCSA login code (the one-time code FMCSA sends when STS logs
in to file in DataQs), by text message or automated call through Twilio.

The code the carrier sends back is kept only until it expires (10 minutes) or the staff member who
asked marks it used, then wiped; it is never logged, emailed or put in the audit trail.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsOtpMethod, DataQsOtpStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsOtpRequest(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_otp_requests"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[DataQsOtpMethod] = mapped_column(  # TEXT or AI_CALL
        enum_type(DataQsOtpMethod, "dataqs_otp_request_method")
    )
    phone: Mapped[str] = mapped_column(String(20))  # E.164, e.g. +12095550123
    status: Mapped[DataQsOtpStatus] = mapped_column(enum_type(DataQsOtpStatus, "dataqs_otp_status"))
    requested_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    provider_sid: Mapped[str | None] = mapped_column(String(64))  # Twilio message or call SID
    code: Mapped[str | None] = mapped_column(String(12))  # wiped when used or expired
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
