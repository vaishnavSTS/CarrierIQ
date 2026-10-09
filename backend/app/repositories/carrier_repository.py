"""Database access for carriers."""

from collections.abc import Iterable
from dataclasses import asdict
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import CarrierValues
from app.models import Authority, Carrier
from app.models.enums import DocketPrefix


class CarrierRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_usdot(self, usdot_number: int) -> Carrier | None:
        return self.db.scalars(
            select(Carrier).where(Carrier.usdot_number == usdot_number)
        ).one_or_none()

    def legal_names(self, usdot_numbers: Iterable[int]) -> dict[int, str]:
        """Legal names of the given USDOT numbers that are loaded; the rest are left out."""
        wanted = set(usdot_numbers)
        if not wanted:
            return {}
        rows = self.db.execute(
            select(Carrier.usdot_number, Carrier.legal_name).where(Carrier.usdot_number.in_(wanted))
        )
        return {usdot: name for usdot, name in rows}

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

    def find_by_docket(self, prefix: DocketPrefix, number: str) -> list[Carrier]:
        return list(
            self.db.scalars(
                select(Carrier)
                .join(Authority, Authority.carrier_id == Carrier.id)
                .where(Authority.docket_prefix == prefix, Authority.docket_number == number)
                .order_by(Carrier.usdot_number)
                .distinct()
            )
        )

    def search_by_name(self, name: str, limit: int) -> list[Carrier]:
        """Loaded carriers whose legal or DBA name contains `name`, closest matches first.

        `name` must already be cleaned (no LIKE wildcards; see services/carrier_search_query.py).
        """
        pattern = f"%{name}%"
        closeness = func.greatest(
            func.similarity(Carrier.legal_name, name),
            func.coalesce(func.similarity(Carrier.dba_name, name), 0),
        )
        return list(
            self.db.scalars(
                select(Carrier)
                .where(or_(Carrier.legal_name.ilike(pattern), Carrier.dba_name.ilike(pattern)))
                .order_by(closeness.desc(), Carrier.usdot_number)
                .limit(limit)
            )
        )
