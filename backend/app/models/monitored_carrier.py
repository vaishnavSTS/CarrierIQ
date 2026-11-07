"""Admin Monitored DOTs: USDOT numbers STS admins keep an eye on, one list shared by all admins.

Only the number, who added it and when. The company name and the report come from the carrier's
own records (loaded from FMCSA when the number is added), so they stay current.
"""

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class MonitoredCarrier(IdMixin, Base):
    __tablename__ = "monitored_carriers"

    usdot_number: Mapped[int] = mapped_column(BigInteger, unique=True)
    # The admin who added it; kept as "—" once that account is deleted
    added_by_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
