"""How STS reaches a carrier about DataQs requests, plus its encrypted FMCSA login password.

The company's account owner maintains this per-carrier contact in the client portal. Only the
encrypted password is persisted; API responses never contain it.
"""

from sqlalchemy import BigInteger, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsCarrierContact(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_carrier_contacts"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "usdot_number", name="uq_dataqs_carrier_contacts_org_usdot"
        ),
    )

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger)
    email: Mapped[str] = mapped_column(String(254))  # the email on the carrier's FMCSA account
    phone: Mapped[str] = mapped_column(String(30))
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    updated_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
