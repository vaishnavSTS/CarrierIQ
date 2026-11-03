"""Claim your company: which carrier account a USDOT number belongs to, one account per number.

Kept apart from everything FMCSA publishes. It never changes a carrier's records: brokers,
insurance agents and staff still see FMCSA's data for the number, not what the carrier typed when
claiming it. A second sign-up with a claimed number is refused and told to contact STS; STS frees a
number by deleting its row.
"""

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class CarrierClaim(IdMixin, Base):
    __tablename__ = "carrier_claims"

    usdot_number: Mapped[int] = mapped_column(BigInteger, unique=True)
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    claimed_by_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # As the carrier confirmed them when signing up (not FMCSA's names)
    company_name: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str | None] = mapped_column(String(200))
