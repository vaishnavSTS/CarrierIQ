"""Database access for authority (one row per docket)."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import AuthorityValues
from app.models import Authority


class AuthorityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[Authority]:
        return list(
            self.db.scalars(
                select(Authority).where(Authority.carrier_id == carrier_id).order_by(Authority.id)
            )
        )

    def sync(
        self,
        carrier_id: int,
        authorities: Sequence[AuthorityValues],
        *,
        source: str,
        raw_record_id: int,
    ) -> None:
        """Insert new dockets and update the status of known ones. Dockets are never deleted."""
        existing = {(a.docket_prefix, a.docket_number): a for a in self.for_carrier(carrier_id)}
        for values in authorities:
            authority = existing.get((values.docket_prefix, values.docket_number))
            if authority is None:
                self.db.add(
                    Authority(
                        carrier_id=carrier_id,
                        docket_prefix=values.docket_prefix,
                        docket_number=values.docket_number,
                        status=values.status,
                        source=source,
                        raw_record_id=raw_record_id,
                    )
                )
            elif authority.status != values.status:
                authority.status = values.status
                authority.raw_record_id = raw_record_id  # the record the new status came from
        self.db.flush()

    def for_carriers(self, carrier_ids: Sequence[int]) -> dict[int, list[Authority]]:
        by_carrier: dict[int, list[Authority]] = {carrier_id: [] for carrier_id in carrier_ids}
        if carrier_ids:
            rows = self.db.scalars(
                select(Authority)
                .where(Authority.carrier_id.in_(carrier_ids))
                .order_by(Authority.carrier_id, Authority.id)
            )
            for row in rows:
                by_carrier[row.carrier_id].append(row)
        return by_carrier
