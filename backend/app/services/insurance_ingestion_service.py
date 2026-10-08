"""Fetch a carrier's insurance filings (current and past) from Motus and the legacy L&I system,
store every row as received, and apply them to `insurance` (spec Phase 6).

Current filings for a docket come from Motus when Motus holds that docket (it appears in Motus
filings or its authority status came from Motus); otherwise from legacy L&I as of its freeze
date. Past filings come from both systems. Runs after authority, whose dockets it uses to look
up legacy filings (legacy current filings carry no USDOT number).
"""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError
from app.ingestion.insurance_filings import InsuranceFilingAdapter
from app.ingestion.insurance_normalizer import (
    InsuranceValues,
    legacy_current,
    legacy_past,
    motus_current,
    motus_past,
)
from app.ingestion.operating_authority_normalizer import MOTUS
from app.ingestion.socrata_client import SocrataClient
from app.models import IngestionRun
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataset_batch import DatasetBatch, content_key

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class InsuranceIngestResult:
    runs: list[IngestionRun]
    current_filings: int
    past_filings: int
    added: int
    no_longer_on_file: int


class InsuranceIngestionService:
    def __init__(
        self,
        db: Session,
        adapter: InsuranceFilingAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        carriers: CarrierRepository,
        authorities: AuthorityRepository,
        insurance: InsuranceRepository,
        legacy_frozen_on: date,
        today: date | None = None,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.carriers = carriers
        self.authorities = authorities
        self.insurance = insurance
        self.legacy_frozen_on = legacy_frozen_on
        self.today = today

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        """When this carrier's Motus insurance filings were last fetched successfully."""
        return self.runs.last_success_at(
            self.adapter.source,
            self.adapter.motus_current_dataset_id,
            self.adapter.query_for(usdot_number),
        )

    def ingest(self, usdot_number: int) -> InsuranceIngestResult:
        carrier = self.carriers.get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; ingest its census record first"
            )
        today = self.today or datetime.now(UTC).date()
        a = self.adapter
        query = a.query_for(usdot_number)
        dockets = self.authorities.for_carrier(carrier.id)
        docket_keys = [(d.docket_prefix, d.docket_number) for d in dockets]
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )

        fetched = [
            batch.fetch(
                a.motus_current_dataset_id, query, lambda: a.fetch_motus_current(usdot_number)
            ),
            batch.fetch(
                a.motus_history_dataset_id, query, lambda: a.fetch_motus_history(usdot_number)
            ),
            batch.fetch(
                a.legacy_history_dataset_id, query, lambda: a.fetch_legacy_history(usdot_number)
            ),
            batch.fetch(
                a.legacy_current_dataset_id,
                f"{len(docket_keys)} dockets for {query}",
                lambda: a.fetch_legacy_current(docket_keys),
            ),
        ]
        (mc_run, mc_rows), (mh_run, mh_rows), (lh_run, lh_rows), (lc_run, lc_rows) = fetched

        key = content_key("docket_number")
        legacy_key = content_key("prefix_docket_number")
        mc_raws = batch.store(a.motus_current_dataset_id, mc_rows, mc_run, key)
        mh_raws = batch.store(a.motus_history_dataset_id, mh_rows, mh_run, key)
        lh_raws = batch.store(a.legacy_history_dataset_id, lh_rows, lh_run, key)
        lc_raws = batch.store(a.legacy_current_dataset_id, lc_rows, lc_run, legacy_key)

        motus_now = [(v, mc_raws[key(r)][0].id) for r in mc_rows if (v := motus_current(r, today))]
        motus_dockets = {(v.docket_prefix, v.docket_number) for v, _ in motus_now} | {
            (d.docket_prefix, d.docket_number) for d in dockets if d.status_source == MOTUS
        }
        legacy_now = [
            (v, lc_raws[legacy_key(r)][0].id)
            for r in lc_rows
            if (v := legacy_current(r, self.legacy_frozen_on))
            and (v.docket_prefix, v.docket_number) not in motus_dockets
        ]
        past: list[tuple[InsuranceValues, int]] = [
            (v, mh_raws[key(r)][0].id) for r in mh_rows if (v := motus_past(r, today))
        ] + [
            (v, lh_raws[key(r)][0].id)
            for r in lh_rows
            if (v := legacy_past(r, self.legacy_frozen_on))
        ]

        current = motus_now + legacy_now
        added, dropped = self.insurance.sync(carrier.id, current, past, source=a.source)

        batch.succeed({run: len(rows) for run, rows in fetched})
        self.db.commit()
        logger.info(
            "USDOT %s insurance: %d current (%d Motus, %d legacy), %d past; %d added, %d dropped",
            usdot_number,
            len(current),
            len(motus_now),
            len(legacy_now),
            len(past),
            added,
            dropped,
        )
        return InsuranceIngestResult(
            [run for run, _ in fetched], len(current), len(past), added, dropped
        )


def build_insurance_ingestion_service(
    db: Session, client: SocrataClient | None = None
) -> InsuranceIngestionService:
    """Wire the service with its real collaborators (live API unless a client is given)."""
    return InsuranceIngestionService(
        db,
        InsuranceFilingAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        AuthorityRepository(db),
        InsuranceRepository(db),
        legacy_frozen_on=get_settings().legacy_li_frozen_on,
    )
