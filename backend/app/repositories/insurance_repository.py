"""Database access for insurance filings. Rows are never deleted."""

from collections.abc import Sequence
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.insurance_normalizer import InsuranceValues
from app.models import Insurance

NO_LONGER_ON_FILE = "NO_LONGER_ON_FILE"


def _identity(row: Insurance) -> tuple[object, ...]:
    return (
        row.docket_prefix,
        row.docket_number,
        row.insurance_type,
        (row.policy_number or "").replace(" ", "").upper(),
        row.effective_date,
        row.termination_date,
    )


class InsuranceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[Insurance]:
        return list(
            self.db.scalars(
                select(Insurance)
                .where(Insurance.carrier_id == carrier_id)
                .order_by(Insurance.effective_date.desc().nulls_last(), Insurance.id.desc())
            )
        )

    def sync(
        self,
        carrier_id: int,
        current: Sequence[tuple[InsuranceValues, int]],
        past: Sequence[tuple[InsuranceValues, int]],
        *,
        source: str,
    ) -> tuple[int, int]:
        """Apply the latest filings; returns (filings added, filings no longer on file).

        - current filings: matched by identity and refreshed, or added; any filing on file that
          is not in `current` any more is kept but marked no longer on file.
        - past filings: added once; the same filing from the other system is not duplicated.
        """
        existing = self.for_carrier(carrier_id)
        on_file = {_identity(r): r for r in existing if r.on_file}
        past_keys = {_identity(r) for r in existing if not r.on_file}
        added = 0

        matched: set[tuple[object, ...]] = set()
        for values, raw_id in current:
            key = values.identity()
            row = on_file.get(key)
            if row is None:
                row = Insurance(carrier_id=carrier_id)
                self.db.add(row)
                added += 1
            for name, value in asdict(values).items():
                setattr(row, name, value)
            row.source = source
            row.raw_record_id = raw_id
            matched.add(key)

        dropped = 0
        for key, row in on_file.items():
            if key not in matched:
                row.on_file = False
                row.status = NO_LONGER_ON_FILE
                dropped += 1

        for values, raw_id in past:
            key = values.identity()
            if key in past_keys:
                continue
            self.db.add(
                Insurance(
                    carrier_id=carrier_id, source=source, raw_record_id=raw_id, **asdict(values)
                )
            )
            past_keys.add(key)
            added += 1

        self.db.flush()
        return added, dropped
