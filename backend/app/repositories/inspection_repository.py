"""Database access for inspections (unique per source + inspection_id)."""

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import date

from sqlalchemy import Integer, func, or_, select
from sqlalchemy.orm import Session

from app.ingestion.vehicle_inspection_normalizer import InspectionValues
from app.models import Inspection


@dataclass(frozen=True)
class InspectionSummary:
    count: int
    vehicle_oos: int
    driver_oos: int
    first_date: date | None
    last_date: date | None


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

    @staticmethod
    def matches(inspection: Inspection, values: InspectionValues, raw_record_id: int) -> bool:
        """True when the stored inspection already holds exactly these values."""
        return inspection.raw_record_id == raw_record_id and all(
            getattr(inspection, field) == value for field, value in asdict(values).items()
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

    def summary(self, carrier_id: int) -> InspectionSummary:
        row = self.db.execute(
            select(
                func.count(),
                func.count().filter(Inspection.vehicle_oos),
                func.count().filter(Inspection.driver_oos),
                func.min(Inspection.inspection_date),
                func.max(Inspection.inspection_date),
            ).where(Inspection.carrier_id == carrier_id)
        ).one()
        return InspectionSummary(*row)

    def by_year(self, carrier_id: int) -> list[tuple[int, int, int, int]]:
        """(year, inspections, vehicle OOS, driver OOS), oldest year first."""
        year = func.extract("year", Inspection.inspection_date).cast(Integer)
        rows = self.db.execute(
            select(
                year,
                func.count(),
                func.count().filter(Inspection.vehicle_oos),
                func.count().filter(Inspection.driver_oos),
            )
            .where(Inspection.carrier_id == carrier_id)
            .group_by(year)
            .order_by(year)
        )
        return [(y, n, v, d) for y, n, v, d in rows]

    def page(
        self, carrier_id: int, *, offset: int, limit: int, oos_only: bool
    ) -> tuple[int, list[Inspection]]:
        """Total matching inspections, and one page of them, newest first."""
        conditions = [Inspection.carrier_id == carrier_id]
        if oos_only:
            conditions.append(or_(Inspection.vehicle_oos, Inspection.driver_oos))
        total = self.db.scalar(select(func.count()).select_from(Inspection).where(*conditions))
        rows = self.db.scalars(
            select(Inspection)
            .where(*conditions)
            .order_by(Inspection.inspection_date.desc(), Inspection.inspection_id.desc())
            .offset(offset)
            .limit(limit)
        )
        return total or 0, list(rows)

    def recent(self, carrier_id: int, limit: int) -> list[Inspection]:
        return list(
            self.db.scalars(
                select(Inspection)
                .where(Inspection.carrier_id == carrier_id)
                .order_by(Inspection.inspection_date.desc(), Inspection.inspection_id.desc())
                .limit(limit)
            )
        )

    def vehicles(
        self, carrier_id: int, limit: int
    ) -> tuple[int, list[tuple[str, int, date, date]]]:
        """Distinct VIN count, and (vin, inspections, first seen, last seen) newest first."""
        has_vin = (Inspection.carrier_id == carrier_id, Inspection.vin.is_not(None))
        total = self.db.scalar(select(func.count(func.distinct(Inspection.vin))).where(*has_vin))
        last_seen = func.max(Inspection.inspection_date)
        rows = self.db.execute(
            select(Inspection.vin, func.count(), func.min(Inspection.inspection_date), last_seen)
            .where(*has_vin)
            .group_by(Inspection.vin)
            .order_by(last_seen.desc(), Inspection.vin)
            .limit(limit)
        )
        return total or 0, [(vin, n, first, last) for vin, n, first, last in rows if vin]
