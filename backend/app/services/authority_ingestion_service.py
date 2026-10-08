"""Fetch a carrier's operating authority from Motus and the legacy L&I system, store every row
as received, and apply it to `authority` and `authority_history` (spec Phase 6).

Legacy data is applied first and Motus second, so Motus (current) wins; legacy (frozen on
2026-05-14) fills in dockets Motus doesn't hold yet. The carrier must already exist.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError
from app.ingestion.operating_authority import OperatingAuthorityAdapter
from app.ingestion.operating_authority_normalizer import (
    AuthorityEventValues,
    legacy_current,
    legacy_events,
    motus_current,
    motus_events,
)
from app.ingestion.socrata_client import SocrataClient
from app.models import IngestionRun
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataset_batch import DatasetBatch, content_key

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthorityIngestResult:
    runs: list[IngestionRun]
    dockets_updated: int
    events_added: int


class AuthorityIngestionService:
    def __init__(
        self,
        db: Session,
        adapter: OperatingAuthorityAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        carriers: CarrierRepository,
        authorities: AuthorityRepository,
        history: AuthorityHistoryRepository,
        legacy_frozen_on: date,
        today: date | None = None,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.carriers = carriers
        self.authorities = authorities
        self.history = history
        self.legacy_frozen_on = legacy_frozen_on
        self.today = today

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        """When this carrier's Motus authority was last fetched successfully."""
        return self.runs.last_success_at(
            self.adapter.source,
            self.adapter.motus_carrier_dataset_id,
            self.adapter.query_for(usdot_number),
        )

    def ingest(self, usdot_number: int) -> AuthorityIngestResult:
        carrier = self.carriers.get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; ingest its census record first"
            )
        today = self.today or datetime.now(UTC).date()
        query = self.adapter.query_for(usdot_number)
        a = self.adapter
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )

        fetched = [
            batch.fetch(
                a.legacy_carrier_dataset_id, query, lambda: a.fetch_legacy_carrier(usdot_number)
            ),
            batch.fetch(
                a.legacy_authhist_dataset_id, query, lambda: a.fetch_legacy_history(usdot_number)
            ),
            batch.fetch(
                a.motus_carrier_dataset_id, query, lambda: a.fetch_motus_carrier(usdot_number)
            ),
            batch.fetch(
                a.motus_authhist_dataset_id, query, lambda: a.fetch_motus_history(usdot_number)
            ),
        ]
        (
            (legacy_run, legacy_rows),
            (lhist_run, lhist_rows),
            (motus_run, motus_rows),
            (
                mhist_run,
                mhist_rows,
            ),
        ) = fetched

        key = content_key("docket_number")
        legacy_raws = batch.store(a.legacy_carrier_dataset_id, legacy_rows, legacy_run, key)
        lhist_raws = batch.store(a.legacy_authhist_dataset_id, lhist_rows, lhist_run, key)
        motus_raws = batch.store(a.motus_carrier_dataset_id, motus_rows, motus_run, key)
        mhist_raws = batch.store(a.motus_authhist_dataset_id, mhist_rows, mhist_run, key)

        updated = 0
        for row in legacy_rows:
            values = legacy_current(row, self.legacy_frozen_on)
            if values is not None:
                self.authorities.apply_operating_authority(
                    carrier.id, values, source=a.source, raw_record_id=legacy_raws[key(row)][0].id
                )
                updated += 1
        for row in motus_rows:
            values = motus_current(row, today)
            if values is not None:
                self.authorities.apply_operating_authority(
                    carrier.id, values, source=a.source, raw_record_id=motus_raws[key(row)][0].id
                )
                updated += 1

        events: list[tuple[AuthorityEventValues, int]] = [
            (event, lhist_raws[key(row)][0].id)
            for row in lhist_rows
            for event in legacy_events(row)
        ] + [
            (event, mhist_raws[key(row)][0].id) for row in mhist_rows for event in motus_events(row)
        ]
        added = self.history.add_missing(carrier.id, events, source=a.source)

        batch.succeed({run: len(rows) for run, rows in fetched})
        self.db.commit()
        logger.info(
            "USDOT %s authority: %d legacy + %d Motus dockets, %d new history events",
            usdot_number,
            len(legacy_rows),
            len(motus_rows),
            added,
        )
        return AuthorityIngestResult([run for run, _ in fetched], updated, added)


def build_authority_ingestion_service(
    db: Session, client: SocrataClient | None = None
) -> AuthorityIngestionService:
    """Wire the service with its real collaborators (live API unless a client is given)."""
    return AuthorityIngestionService(
        db,
        OperatingAuthorityAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        AuthorityRepository(db),
        AuthorityHistoryRepository(db),
        legacy_frozen_on=get_settings().legacy_li_frozen_on,
    )
