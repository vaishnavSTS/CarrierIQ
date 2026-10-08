"""Database access for inspections (unique per source + inspection_id)."""

from collections.abc import Sequence
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.vehicle_inspection_normalizer import InspectionValues
from app.models import Inspection


class InspectionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def by_inspection_ids(
        self, source: str, inspection_ids: Sequence[str]
    ) -> dict[str, Inspection]:
        if not inspection_ids:
            return {}
        rows = self.db.scalars(
            select(Inspection).where(
                Inspection.source == source, Inspection.inspection_id.in_(inspection_ids)
            )
        )
        return {row.inspection_id: row for row in rows}

    def for_carrier(self, carrier_id: int) -> list[Inspection]:
        return list(
            self.db.scalars(
                select(Inspection)
                .where(Inspection.carrier_id == carrier_id)
                .order_by(Inspection.inspection_date, Inspection.inspection_id)
            )
        )

    def upsert(
        self,
        existing: Inspection | None,
        values: InspectionValues,
        *,
        carrier_id: int,
        source: str,
        raw_record_id: int,
    ) -> Inspection:
        """Insert a new inspection, or apply a corrected source record to an existing one.

        Inspections are never deleted: one that drops out of the source's rolling window stays.
        """
        if existing is None:
            existing = Inspection(carrier_id=carrier_id, source=source)
            self.db.add(existing)
        for field, value in asdict(values).items():
            setattr(existing, field, value)
        existing.carrier_id = carrier_id
        existing.raw_record_id = raw_record_id
        return existing
