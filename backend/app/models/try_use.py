"""A visitor's one Try Now search, kept for good: it is one time only.

The visitor is known by a keyed hash of their address, so the address itself is never stored. To
give an address another search (say a shared office was blocked), delete its row.
"""

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class TryUse(IdMixin, Base):
    __tablename__ = "try_uses"

    visitor_hash: Mapped[str] = mapped_column(String(64), unique=True)
    usdot_number: Mapped[int] = mapped_column(BigInteger)
