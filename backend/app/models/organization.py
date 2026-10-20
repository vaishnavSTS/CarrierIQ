"""A company that uses CarrierSafetyScan: STS itself (internal portal), an STS client (client
portal) or a freight brokerage (broker portal).

Every user belongs to one organization; the organization's kind decides which portal its users
can reach, and each user's role decides what they can do there.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import OrganizationKind, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class Organization(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[OrganizationKind] = mapped_column(enum_type(OrganizationKind, "organization_kind"))
    # Brokerages: their FMCSA identity, checked at sign-up for active broker authority.
    usdot_number: Mapped[int | None] = mapped_column(Integer)
    docket_number: Mapped[str | None] = mapped_column(String(12))  # e.g. "MC261603"
    authority_source: Mapped[str | None] = mapped_column(String(20))  # MOTUS | LEGACY_LI
    authority_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
