"""Fetch a carrier from the Company Census File and store it as received (spec Section 19.3).

Every attempt is recorded in ingestion_runs. The run is committed on its own first, so a failed
fetch is still recorded. A new raw_records row is stored only when the payload differs from the
latest stored one; an unchanged payload is just a recorded check.
"""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.fingerprint import payload_hash
from app.models import IngestionRun, RawRecord
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CensusIngestResult:
    run: IngestionRun
    # The latest raw record for this carrier; None if the source has no such USDOT number.
    raw_record: RawRecord | None
    # True when this fetch stored a new raw record (first fetch, or the source data changed).
    changed: bool


class CensusIngestionService:
    def __init__(
        self,
        db: Session,
        adapter: CompanyCensusAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records

    def ingest(self, usdot_number: int) -> CensusIngestResult:
        self.adapter.validate_usdot_number(usdot_number)  # bad input never creates a run
        run = self.runs.start(
            self.adapter.source, self.adapter.dataset_id, self.adapter.query_for(usdot_number)
        )
        self.db.commit()

        try:
            row = self.adapter.fetch_by_usdot(usdot_number)
        except SourceFetchError as exc:
            self.runs.fail(run, exc.message)
            self.db.commit()
            logger.error("Census fetch failed for USDOT %s (run %d)", usdot_number, run.id)
            raise

        if row is None:
            self.runs.succeed(run, records_fetched=0)
            self.db.commit()
            return CensusIngestResult(run=run, raw_record=None, changed=False)

        raw_record, changed = self._store(str(usdot_number), row, run)
        self.runs.succeed(run, records_fetched=1)
        self.db.commit()
        logger.info(
            "USDOT %s: %s raw record %d (run %d)",
            usdot_number,
            "stored new" if changed else "unchanged,",
            raw_record.id,
            run.id,
        )
        return CensusIngestResult(run=run, raw_record=raw_record, changed=changed)

    def _store(
        self, external_id: str, row: dict[str, object], run: IngestionRun
    ) -> tuple[RawRecord, bool]:
        fingerprint = payload_hash(row)
        latest = self.raw_records.latest(self.adapter.source, self.adapter.dataset_id, external_id)
        if latest is not None and latest.payload_hash == fingerprint:
            return latest, False

        record = self.raw_records.add(
            source=self.adapter.source,
            dataset_id=self.adapter.dataset_id,
            external_id=external_id,
            payload=row,
            payload_hash=fingerprint,
            ingestion_run_id=run.id,
        )
        return record, True
