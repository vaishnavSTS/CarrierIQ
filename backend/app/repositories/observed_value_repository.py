"""Keeps a carrier's addresses, phones, officers and domains in step with the latest source record.

Rows are never deleted or rewritten (spec Section 20). For each value in the latest record:
- already current (same identity fields): extend `last_seen`, refresh non-identity fields
- not current: insert a new current row (first_seen = last_seen = today)
Current rows missing from the latest record are marked `is_current = False`.
"""

from collections.abc import Sequence
from dataclasses import asdict
from datetime import date
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import ObservedValues
from app.models import Address, Domain, Officer, Phone

ObservedModel = TypeVar("ObservedModel", Address, Phone, Officer, Domain)


class ObservedValueRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def current(self, model: type[ObservedModel], carrier_id: int) -> list[ObservedModel]:
        return list(
            self.db.scalars(
                select(model)
                .where(model.carrier_id == carrier_id, model.is_current.is_(True))
                .order_by(model.id)
            )
        )

    def sync(
        self,
        model: type[ObservedModel],
        carrier_id: int,
        observed: Sequence[ObservedValues],
        *,
        seen_on: date,
        source: str,
        raw_record_id: int,
    ) -> None:
        current = self.current(model, carrier_id)
        unmatched = list(current)

        for values in observed:
            fields = asdict(values)
            identity = tuple(fields[name] for name in values.IDENTITY)
            match = next(
                (
                    row
                    for row in unmatched
                    if tuple(getattr(row, name) for name in values.IDENTITY) == identity
                ),
                None,
            )
            if match is not None:
                unmatched.remove(match)
                for name, value in fields.items():
                    setattr(match, name, value)
                match.last_seen = seen_on
            else:
                self.db.add(
                    model(
                        carrier_id=carrier_id,
                        **fields,
                        first_seen=seen_on,
                        last_seen=seen_on,
                        is_current=True,
                        source=source,
                        raw_record_id=raw_record_id,
                    )
                )

        for row in unmatched:
            row.is_current = False
        self.db.flush()

    def current_for_carriers(
        self, model: type[ObservedModel], carrier_ids: Sequence[int]
    ) -> dict[int, list[ObservedModel]]:
        by_carrier: dict[int, list[ObservedModel]] = {carrier_id: [] for carrier_id in carrier_ids}
        if carrier_ids:
            rows = self.db.scalars(
                select(model)
                .where(model.carrier_id.in_(carrier_ids), model.is_current.is_(True))
                .order_by(model.carrier_id, model.id)
            )
            for row in rows:
                by_carrier[row.carrier_id].append(row)
        return by_carrier
