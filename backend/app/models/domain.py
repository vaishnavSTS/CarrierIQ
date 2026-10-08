"""Internet domains taken from a carrier's email or website (spec Section 11.2)."""

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DomainOrigin, enum_type
from app.models.mixins import IdMixin, ObservedPeriodMixin, SourceTraceMixin, UpdatedAtMixin


class Domain(IdMixin, UpdatedAtMixin, ObservedPeriodMixin, SourceTraceMixin, Base):
    __tablename__ = "domains"

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    domain: Mapped[str] = mapped_column(String(255), index=True)
    origin: Mapped[DomainOrigin] = mapped_column(enum_type(DomainOrigin, "domain_origin"))
