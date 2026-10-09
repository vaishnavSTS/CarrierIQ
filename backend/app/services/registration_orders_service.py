"""Fetch a carrier's out-of-service orders and authority revocations / suspensions.

A refresh detail source. Each dataset's full answer for the carrier is stored as one raw record
(`{"rows": [...]}`, keyed by USDOT number), so the latest record is always the current list:
an order that is rescinded or removed never lingers as a stale separate row. The registration
health checks read these records back; nothing is normalized into tables yet.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.ingestion.registration_orders import RegistrationOrdersAdapter
from app.ingestion.socrata_client import SocrataClient
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataset_batch import DatasetBatch

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RegistrationOrdersResult:
    oos_orders: int
    revocations: int


class RegistrationOrdersService:
    def __init__(
        self,
        db: Session,
        adapter: RegistrationOrdersAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"dot_number={usdot_number}"

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.revoke_dataset_id, self.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> RegistrationOrdersResult:
        a = self.adapter
        query = self.query_for(usdot_number)
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )
        oos_run, oos = batch.fetch(
            a.oos_dataset_id, query, lambda: a.fetch_oos_orders(usdot_number)
        )
        revoke_run, revocations = batch.fetch(
            a.revoke_dataset_id, query, lambda: a.fetch_revocations(usdot_number)
        )
        key = str(usdot_number)
        batch.store(a.oos_dataset_id, [{"rows": oos}], oos_run, lambda _: key)
        batch.store(a.revoke_dataset_id, [{"rows": revocations}], revoke_run, lambda _: key)
        batch.succeed({oos_run: len(oos), revoke_run: len(revocations)})
        self.db.commit()
        logger.info(
            "USDOT %d: %d out-of-service orders, %d revocation / suspension orders",
            usdot_number,
            len(oos),
            len(revocations),
        )
        return RegistrationOrdersResult(len(oos), len(revocations))

    def latest(self, usdot_number: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """(out-of-service orders, revocation / suspension orders) as last fetched."""
        a = self.adapter
        key = str(usdot_number)
        oos = self.raw_records.latest(a.source, a.oos_dataset_id, key)
        revoke = self.raw_records.latest(a.source, a.revoke_dataset_id, key)
        return (
            list(oos.payload.get("rows", [])) if oos else [],
            list(revoke.payload.get("rows", [])) if revoke else [],
        )


def build_registration_orders_service(
    db: Session, client: SocrataClient | None = None
) -> RegistrationOrdersService:
    return RegistrationOrdersService(
        db,
        RegistrationOrdersAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
    )
