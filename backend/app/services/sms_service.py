"""Fetch a carrier's FMCSA SMS (CSA) results and crash reports.

A refresh detail source, stored like BOC-3: each dataset's full answer for the carrier is one
raw record (`{"rows": [...]}`, keyed by USDOT number), so the latest record is always the
current answer. `sms_for()` and `crashes_for()` read them back for the Safety tab.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from functools import partial
from typing import Any

from sqlalchemy.orm import Session

from app.ingestion.sms import CRASH_YEARS, SOURCE, SmsAdapter
from app.ingestion.socrata_client import SocrataClient
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.schemas.carrier_safety import CrashSummaryOut, SmsOut
from app.services.dataset_batch import DatasetBatch
from app.services.sms_results import crash_summary, sms_result

logger = logging.getLogger(__name__)

DATASET_NAMES = ("SMS AB Pass", "SMS C Pass", "SMS AB PassProperty", "SMS C PassProperty")


def _rows(raw_records: RawRecordRepository, dataset_id: str, usdot: int) -> list[Any] | None:
    raw = raw_records.latest(SOURCE, dataset_id, str(usdot))
    return list(raw.payload.get("rows", [])) if raw else None


def sms_for(raw_records: RawRecordRepository, usdot_number: int) -> SmsOut | None:
    """FMCSA's SMS row for the carrier as last fetched; None when not fetched yet."""
    adapter_ids = SmsAdapter.dataset_ids()
    fetched = [
        (dataset_id, name, rows)
        for dataset_id, name in zip(adapter_ids, DATASET_NAMES, strict=True)
        if (rows := _rows(raw_records, dataset_id, usdot_number)) is not None
    ]
    return sms_result(fetched)


def crashes_for(
    raw_records: RawRecordRepository, usdot_number: int, today: date
) -> CrashSummaryOut | None:
    rows = _rows(raw_records, SmsAdapter.crash_id(), usdot_number)
    return crash_summary(rows, today, CRASH_YEARS)


@dataclass(frozen=True)
class SmsResult:
    sms_rows: int
    crashes: int


class SmsService:
    def __init__(
        self,
        db: Session,
        adapter: SmsAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.today = today

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"dot_number={usdot_number}"

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.crash_dataset_id, self.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> SmsResult:
        a = self.adapter
        query = self.query_for(usdot_number)
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )
        fetched = []
        for dataset_id in a.sms_dataset_ids:
            run, rows = batch.fetch(
                dataset_id, query, partial(a.fetch_sms, dataset_id, usdot_number)
            )
            fetched.append((dataset_id, run, rows))
        crash_run, crashes = batch.fetch(
            a.crash_dataset_id, query, lambda: a.fetch_crashes(usdot_number, self.today())
        )
        fetched.append((a.crash_dataset_id, crash_run, crashes))
        key = str(usdot_number)
        for dataset_id, run, rows in fetched:
            batch.store(dataset_id, [{"rows": rows}], run, lambda _: key)
        batch.succeed({run: len(rows) for _, run, rows in fetched})
        self.db.commit()
        sms_rows = sum(len(rows) for _, _, rows in fetched[:-1])
        logger.info("USDOT %d: %d SMS rows, %d crash rows", usdot_number, sms_rows, len(crashes))
        return SmsResult(sms_rows, len(crashes))


def build_sms_service(db: Session, client: SocrataClient | None = None) -> SmsService:
    return SmsService(
        db,
        SmsAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
    )
