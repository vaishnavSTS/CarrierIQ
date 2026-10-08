"""Fetch a carrier from the Company Census File, store it as received, and normalize it
into the canonical tables (spec Section 19.3).

Every attempt is recorded in ingestion_runs. The run is committed on its own first, so a failed
fetch is still recorded. A new raw_records row is stored only when the payload differs from the
latest stored one; an unchanged payload is just a recorded check. The latest raw record is then
applied to the canonical tables. A record that cannot be normalized fails the run but is kept.
"""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import SourceDataError, SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.fingerprint import payload_hash
from app.ingestion.socrata_client import SocrataClient
from app.models import Carrier, IngestionRun, RawRecord
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.census_normalization_service import CensusNormalizationService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CensusIngestResult:
    run: IngestionRun
    # The latest raw record for this carrier; None if the source has no such USDOT number.
    raw_record: RawRecord | None
    # True when this fetch stored a new raw record (first fetch, or the source data changed).
    changed: bool
    # The canonical carrier; None if the source has no such USDOT number.
    carrier: Carrier | None
    # Carrier attributes whose value changed and were written to history.
    changed_attributes: tuple[str, ...] = ()


class CensusIngestionService:
    def __init__(
        self,
        db: Session,
        adapter: CompanyCensusAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        normalizer: CensusNormalizationService,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.normalizer = normalizer

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
            return CensusIngestResult(run=run, raw_record=None, changed=False, carrier=None)

        raw_record, changed = self._store(str(usdot_number), row, run)
        try:
            outcome = self.normalizer.apply(raw_record, is_new_record=changed)
        except SourceDataError as exc:
            self.runs.fail(run, exc.message)
            self.db.commit()  # keeps the raw record for auditing and reprocessing
            logger.error("Census record for USDOT %s could not be normalized", usdot_number)
            raise

        self.runs.succeed(run, records_fetched=1)
        self.db.commit()
        logger.info(
            "USDOT %s: %s raw record %d (run %d)",
            usdot_number,
            "stored new" if changed else "unchanged,",
            raw_record.id,
            run.id,
        )
        return CensusIngestResult(
            run=run,
            raw_record=raw_record,
            changed=changed,
            carrier=outcome.carrier,
            changed_attributes=outcome.changed_attributes,
        )

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


def build_census_ingestion_service(
    db: Session, client: SocrataClient | None = None
) -> CensusIngestionService:
    """Wire the service with its real collaborators (live API unless a client is given)."""
    return CensusIngestionService(
        db,
        CompanyCensusAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CensusNormalizationService(
            CarrierRepository(db),
            ObservedValueRepository(db),
            AuthorityRepository(db),
            CarrierHistoryRepository(db),
        ),
    )
