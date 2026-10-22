"""How STS reaches a carrier about its DataQs requests: the email on the carrier's FMCSA account,
a phone number, and the best time to call. The company's account owner keeps it up to date in the
client portal (one per carrier the company holds); STS staff see it on that carrier's cases.
"""

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
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
    best_time: Mapped[str | None] = mapped_column(String(100))  # e.g. "Weekdays 8-11 am CT"
    updated_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
