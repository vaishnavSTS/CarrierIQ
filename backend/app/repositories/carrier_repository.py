"""Database access for carriers."""

from dataclasses import asdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import CarrierValues
from app.models import Carrier


class CarrierRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_usdot(self, usdot_number: int) -> Carrier | None:
        return self.db.scalars(
            select(Carrier).where(Carrier.usdot_number == usdot_number)
        ).one_or_none()

    def upsert(self, values: CarrierValues, refreshed_at: datetime) -> Carrier:
        """Create the carrier or overwrite its current values (history is kept separately)."""
        carrier = self.get_by_usdot(values.usdot_number)
        if carrier is None:
            carrier = Carrier(usdot_number=values.usdot_number)
            self.db.add(carrier)
        for field, value in asdict(values).items():
            setattr(carrier, field, value)
        carrier.last_refreshed_at = refreshed_at
        self.db.flush()
        return carrier
