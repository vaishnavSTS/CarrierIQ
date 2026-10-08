"""Several dataset fetches for one carrier, recorded and stored together (spec Section 19.1).

Each fetch is its own ingestion run, committed first so a failure is recorded. If any fetch
fails, nothing is stored and every run started so far is marked failed. Raw rows are stored
only when new or changed (by payload hash).
"""

import logging
from collections.abc import Callable, Sequence

from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError
from app.ingestion.fingerprint import payload_hash
from app.ingestion.socrata_client import Row
from app.models import IngestionRun, RawRecord
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository

logger = logging.getLogger(__name__)

# Raw record per source key, and whether it was newly stored (new or changed).
StoredRaws = dict[str, tuple[RawRecord, bool]]


class DatasetBatch:
    def __init__(
        self,
        db: Session,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        source: str,
        label: str,
    ) -> None:
        self.db = db
        self.runs = runs
        self.raw_records = raw_records
        self.source = source
        self.label = label  # for log messages, e.g. "USDOT 295017"
        self.started: list[IngestionRun] = []

    def fetch(
        self, dataset_id: str, query: str, fetch: Callable[[], list[Row]]
    ) -> tuple[IngestionRun, list[Row]]:
        run = self.runs.start(self.source, dataset_id, query)
        self.db.commit()
        self.started.append(run)
        try:
            return run, fetch()
        except SourceFetchError as exc:
            for earlier in self.started[:-1]:
                self.runs.fail(earlier, f"Fetch failed in run {run.id}; nothing stored")
            self.runs.fail(run, exc.message)
            self.db.commit()
            logger.error("Fetch from %s failed for %s (run %d)", dataset_id, self.label, run.id)
            raise

    def store(
        self,
        dataset_id: str,
        rows: Sequence[Row],
        run: IngestionRun,
        key: Callable[[Row], str],
    ) -> StoredRaws:
        keys = [key(row) for row in rows]
        latest = self.raw_records.latest_many(self.source, dataset_id, keys)
        stored: StoredRaws = {}
        new_records: list[RawRecord] = []
        for row, row_key in zip(rows, keys, strict=True):
            fingerprint = payload_hash(row)
            previous = latest.get(row_key)
            if previous is not None and previous.payload_hash == fingerprint:
                stored[row_key] = (previous, False)
                continue
            record = RawRecord(
                source=self.source,
                dataset_id=dataset_id,
                external_id=row_key,
                payload=row,
                payload_hash=fingerprint,
                ingestion_run_id=run.id,
            )
            new_records.append(record)
            stored[row_key] = (record, True)
        self.raw_records.add_many(new_records)
        return stored

    def succeed(self, counts: dict[IngestionRun, int]) -> None:
        for run, fetched in counts.items():
            self.runs.succeed(run, records_fetched=fetched)


def field_key(field: str) -> Callable[[Row], str]:
    """Key rows by one source field (e.g. an inspection or violation id)."""
    return lambda row: str(row[field])


def content_key(prefix_field: str) -> Callable[[Row], str]:
    """Key rows that have no id of their own by a field plus their content: an unchanged row
    maps to the same key; a changed one is a new fact (history rows never change in place)."""
    return lambda row: f"{row.get(prefix_field, '')}|{payload_hash(row)[:24]}"
