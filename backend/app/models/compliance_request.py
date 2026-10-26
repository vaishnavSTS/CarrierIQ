"""A client asking STS for help with a compliance service (the carrier profile's Compliance tab):
reactivating authority, a UCR filing, a California MCP, drug and alcohol testing, driver files and
so on. STS is emailed; staff see the request in the internal portal and mark it handled."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ComplianceRequestStatus, ComplianceService, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class ComplianceRequest(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "compliance_requests"

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger, index=True)
    service: Mapped[ComplianceService] = mapped_column(
        enum_type(ComplianceService, "compliance_service", length=30)
    )
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ComplianceRequestStatus] = mapped_column(
        enum_type(ComplianceRequestStatus, "compliance_request_status")
    )
    requested_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    handled_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_error: Mapped[str | None] = mapped_column(Text)  # the email to STS failed: why
