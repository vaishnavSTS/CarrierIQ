"""BOC-3 process agents from FMCSA's Motus and old L&I data (no filing dates in either)."""

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin, ObservedPeriodMixin, SourceTraceMixin, UpdatedAtMixin


class ProcessAgent(IdMixin, UpdatedAtMixin, ObservedPeriodMixin, SourceTraceMixin, Base):
    __tablename__ = "process_agents"
    __table_args__ = (
        UniqueConstraint(
            "carrier_id", "source_system", "docket", "name", name="uq_process_agents_agent"
        ),
    )

    carrier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carriers.id", ondelete="CASCADE"), index=True
    )
    docket: Mapped[str] = mapped_column(String(20), default="", server_default="")  # MC207446
    name: Mapped[str] = mapped_column(String(200))
    attention: Mapped[str | None] = mapped_column(String(200))  # contact person (L&I only)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(10))
    source_system: Mapped[str] = mapped_column(String(20))  # MOTUS | LEGACY_LI
