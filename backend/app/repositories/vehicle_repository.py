"""Database access for vehicles (one row per VIN)."""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Vehicle


class VehicleRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create(self, vins: Iterable[str]) -> dict[str, Vehicle]:
        wanted = set(vins)
        if not wanted:
            return {}
        found = {v.vin: v for v in self.db.scalars(select(Vehicle).where(Vehicle.vin.in_(wanted)))}
        for vin in sorted(wanted - found.keys()):
            vehicle = Vehicle(vin=vin)
            self.db.add(vehicle)
            found[vin] = vehicle
        self.db.flush()
        return found

    def by_ids(self, ids: Iterable[int]) -> dict[int, Vehicle]:
        wanted = set(ids)
        if not wanted:
            return {}
        return {v.id: v for v in self.db.scalars(select(Vehicle).where(Vehicle.id.in_(wanted)))}
