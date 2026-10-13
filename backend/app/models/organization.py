"""A company that uses CarrierIQ: STS itself (internal portal) or an STS client (client portal).

Every user belongs to one organization; the organization's kind decides which portal its users
can reach, and each user's role decides what they can do there.
"""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import OrganizationKind, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class Organization(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[OrganizationKind] = mapped_column(enum_type(OrganizationKind, "organization_kind"))
