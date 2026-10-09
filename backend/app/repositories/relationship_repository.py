"""Database access for relationships (entity -> entity links, spec Section 11.4)."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Relationship
from app.models.enums import Confidence


@dataclass(frozen=True)
class LinkValues:
    source: tuple[str, int]
    relationship_type: str
    target: tuple[str, int]
    first_seen: date
    last_seen: date
    observation_count: int
    confidence: Confidence
    raw_record_id: int | None


class RelationshipRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def upsert_many(self, links: Sequence[LinkValues]) -> int:
        """Create or update many links with one lookup and one flush; returns how many."""
        if not links:
            return 0
        existing = {
            (
                r.source_entity_type,
                r.source_entity_id,
                r.relationship_type,
                r.target_entity_type,
                r.target_entity_id,
            ): r
            for r in self.db.scalars(
                select(Relationship).where(
                    Relationship.source_entity_type.in_({link.source[0] for link in links}),
                    Relationship.source_entity_id.in_({link.source[1] for link in links}),
                    Relationship.relationship_type.in_({link.relationship_type for link in links}),
                    Relationship.target_entity_type.in_({link.target[0] for link in links}),
                    Relationship.target_entity_id.in_({link.target[1] for link in links}),
                )
            )
        }
        for link in links:
            key = (*link.source, link.relationship_type, *link.target)
            row = existing.get(key)
            if row is None:
                row = Relationship(
                    source_entity_type=link.source[0],
                    source_entity_id=link.source[1],
                    relationship_type=link.relationship_type,
                    target_entity_type=link.target[0],
                    target_entity_id=link.target[1],
                )
                self.db.add(row)
                existing[key] = row
            row.first_seen = link.first_seen
            row.last_seen = link.last_seen
            row.observation_count = link.observation_count
            row.confidence = link.confidence
            row.raw_record_id = link.raw_record_id
        self.db.flush()
        return len(links)

    def from_source(
        self, source: tuple[str, int], relationship_types: Iterable[str]
    ) -> list[Relationship]:
        """Links leaving one entity, e.g. every contact link of USDOT 3794204."""
        return list(
            self.db.scalars(
                select(Relationship).where(
                    Relationship.source_entity_type == source[0],
                    Relationship.source_entity_id == source[1],
                    Relationship.relationship_type.in_(set(relationship_types)),
                )
            )
        )

    def delete_many(self, rows: Sequence[Relationship]) -> None:
        for row in rows:
            self.db.delete(row)
        self.db.flush()

    def to_target(self, relationship_type: str, target: tuple[str, int]) -> list[Relationship]:
        """Links pointing at one entity, e.g. every VIN seen with USDOT 295017."""
        return list(
            self.db.scalars(
                select(Relationship).where(
                    Relationship.relationship_type == relationship_type,
                    Relationship.target_entity_type == target[0],
                    Relationship.target_entity_id == target[1],
                )
            )
        )

    def from_sources(
        self, relationship_type: str, source_type: str, source_ids: Iterable[int]
    ) -> list[Relationship]:
        """Links leaving many entities, e.g. every carrier the given VINs were seen with."""
        ids = set(source_ids)
        if not ids:
            return []
        return list(
            self.db.scalars(
                select(Relationship).where(
                    Relationship.relationship_type == relationship_type,
                    Relationship.source_entity_type == source_type,
                    Relationship.source_entity_id.in_(ids),
                )
            )
        )
