"""Fetch a carrier from the Company Census File, recording every attempt in ingestion_runs.

Each run is committed on its own, so a failed fetch is still recorded.
"""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row
from app.models import IngestionRun
from app.repositories.ingestion_run_repository import IngestionRunRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CensusFetchResult:
    run: IngestionRun
    row: Row | None  # None: the source has no carrier with this USDOT number


class CensusIngestionService:
    def __init__(
        self, db: Session, adapter: CompanyCensusAdapter, runs: IngestionRunRepository
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs

    def fetch(self, usdot_number: int) -> CensusFetchResult:
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

        self.runs.succeed(run, records_fetched=0 if row is None else 1)
        self.db.commit()
        return CensusFetchResult(run=run, row=row)
