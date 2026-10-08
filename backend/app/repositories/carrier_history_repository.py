"""Database access for carrier_attribute_history and carrier_snapshots (spec Section 11.3).

History rows are append-only: a change closes the open row (`valid_to`) and opens a new one.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CarrierAttributeHistory, CarrierSnapshot


class CarrierHistoryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def open_rows(self, carrier_id: int) -> dict[str, CarrierAttributeHistory]:
        """The current (valid_to IS NULL) row for each attribute."""
        rows = self.db.scalars(
            select(CarrierAttributeHistory).where(
                CarrierAttributeHistory.carrier_id == carrier_id,
                CarrierAttributeHistory.valid_to.is_(None),
            )
        )
        return {row.attribute: row for row in rows}

    def record_changes(
        self,
        carrier_id: int,
        values: dict[str, str | None],
        *,
        observed_on: date,
        source: str,
        raw_record_id: int,
    ) -> list[str]:
        """Close and reopen every attribute whose value differs; returns the changed attributes.

        An attribute with no open row counts as empty, so an empty value opens no row until the
        attribute has had a value.
        """
        open_rows = self.open_rows(carrier_id)
        changed: list[str] = []
        for attribute, value in values.items():
            current = open_rows.get(attribute)
            if (current.value if current else None) == value:
                continue
            if current is not None:
                current.valid_to = observed_on
                # Flush the close before opening the next row: only one open row is allowed.
                self.db.flush()
            self.db.add(
                CarrierAttributeHistory(
                    carrier_id=carrier_id,
                    attribute=attribute,
                    value=value,
                    valid_from=observed_on,
                    source=source,
                    raw_record_id=raw_record_id,
                )
            )
            changed.append(attribute)
        self.db.flush()
        return changed

    def add_snapshot(
        self,
        carrier_id: int,
        *,
        snapshot_date: date,
        data_hash: str,
        source: str,
        raw_record_id: int,
    ) -> CarrierSnapshot:
        snapshot = CarrierSnapshot(
            carrier_id=carrier_id,
            snapshot_date=snapshot_date,
            data_hash=data_hash,
            source=source,
            raw_record_id=raw_record_id,
        )
        self.db.add(snapshot)
        self.db.flush()
        return snapshot

    def all_for_carrier(self, carrier_id: int) -> list[CarrierAttributeHistory]:
        """Every history row, grouped by attribute in the order values were observed."""
        return list(
            self.db.scalars(
                select(CarrierAttributeHistory)
                .where(CarrierAttributeHistory.carrier_id == carrier_id)
                .order_by(CarrierAttributeHistory.attribute, CarrierAttributeHistory.id)
            )
        )
