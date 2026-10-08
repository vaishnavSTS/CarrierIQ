"""A link between two entities, e.g. VIN -> carrier (spec Section 11.4).

Entities are referenced by (type, id) pairs, so one table covers VIN_OBSERVED_WITH,
SHARES_PHONE, SHARES_ADDRESS, SHARES_OFFICER and future relationship types.
"""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import Confidence, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class Relationship(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "relationships"
    __table_args__ = (
        # One row per link; repeat observations update last_seen / observation_count.
        UniqueConstraint(
            "source_entity_type",
            "source_entity_id",
            "relationship_type",
            "target_entity_type",
            "target_entity_id",
            name="uq_relationships_link",
        ),
        # Reverse lookup, e.g. "which VINs were seen with this carrier?"
        Index("ix_relationships_target", "target_entity_type", "target_entity_id"),
    )

    source_entity_type: Mapped[str] = mapped_column(String(50))
    source_entity_id: Mapped[int] = mapped_column(BigInteger)
    relationship_type: Mapped[str] = mapped_column(String(50))  # e.g. VIN_OBSERVED_WITH
    target_entity_type: Mapped[str] = mapped_column(String(50))
    target_entity_id: Mapped[int] = mapped_column(BigInteger)
    first_seen: Mapped[date] = mapped_column(Date)
    last_seen: Mapped[date] = mapped_column(Date)
    observation_count: Mapped[int] = mapped_column(default=1, server_default="1")
    confidence: Mapped[Confidence] = mapped_column(enum_type(Confidence, "confidence"))
    raw_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("raw_records.id"), index=True
    )
