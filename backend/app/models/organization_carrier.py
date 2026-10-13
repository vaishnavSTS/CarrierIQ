"""A USDOT number a client organization operates, as shown in its client portal.

Keyed by USDOT number rather than carriers.id: a client can name a carrier CarrierIQ has not
loaded yet. The client portal shows every linked carrier at once (public FMCSA data only); STS
checks a new sign-up's company, phone and email against FMCSA on the Accounts page. `verified`
is true for carriers STS linked itself.
"""

from sqlalchemy import BigInteger, ForeignKey, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class OrganizationCarrier(IdMixin, Base):
    __tablename__ = "organization_carriers"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "usdot_number", name="uq_organization_carriers_org_usdot"
        ),
    )

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger, index=True)
    verified: Mapped[bool] = mapped_column(default=False, server_default=false())
