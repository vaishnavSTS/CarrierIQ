"""Database access for raw_records. Rows are only ever inserted, never updated."""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RawRecord


class RawRecordRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def latest(self, source: str, dataset_id: str, external_id: str) -> RawRecord | None:
        """The most recently stored record for this source key."""
        return self.db.scalars(
            select(RawRecord)
            .where(
                RawRecord.source == source,
                RawRecord.dataset_id == dataset_id,
                RawRecord.external_id == external_id,
            )
            .order_by(RawRecord.id.desc())
            .limit(1)
        ).one_or_none()

    def latest_many(
        self, source: str, dataset_id: str, external_ids: Sequence[str]
    ) -> dict[str, RawRecord]:
        """The most recently stored record for each source key, in one query."""
        if not external_ids:
            return {}
        rows = self.db.scalars(
            select(RawRecord)
            .where(
                RawRecord.source == source,
                RawRecord.dataset_id == dataset_id,
                RawRecord.external_id.in_(external_ids),
            )
            .order_by(RawRecord.external_id, RawRecord.id.desc())
            .distinct(RawRecord.external_id)
        )
        return {row.external_id: row for row in rows}

    def add(
        self,
        *,
        source: str,
        dataset_id: str,
        external_id: str,
        payload: dict[str, Any],
        payload_hash: str,
        ingestion_run_id: int,
    ) -> RawRecord:
        record = RawRecord(
            source=source,
            dataset_id=dataset_id,
            external_id=external_id,
            payload=payload,
            payload_hash=payload_hash,
            ingestion_run_id=ingestion_run_id,
        )
        self.db.add(record)
        self.db.flush()
        return record

    def add_many(self, records: Sequence[RawRecord]) -> None:
        """Insert many records in batched statements (ids are set afterwards)."""
        self.db.add_all(records)
        self.db.flush()
