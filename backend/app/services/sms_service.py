"""Fetch a carrier's FMCSA SMS (CSA) results and crash reports.

A refresh detail source. Each dataset's full answer for the carrier is kept as one raw record
(`{"rows": [...]}`, keyed by USDOT number) as proof, and normalized into `sms_results` (one row
per BASIC per month) and `crashes` (one row per report). `sms_for()` and `crashes_for()` read
those tables for the Safety tab and the packet.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import partial

from sqlalchemy.orm import Session

from app.ingestion.sms import CRASH_YEARS, SOURCE, SmsAdapter
from app.ingestion.socrata_client import SocrataClient
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.safety_record_repository import SafetyRecordRepository
from app.schemas.carrier_safety import BasicOut, CrashOut, CrashSummaryOut, SmsOut
from app.services.dataset_batch import DatasetBatch
from app.services.sms_results import crash_reports, crash_summary, sms_result

logger = logging.getLogger(__name__)

DATASET_NAMES = ("SMS AB Pass", "SMS C Pass", "SMS AB PassProperty", "SMS C PassProperty")


def _query(usdot_number: int) -> str:
    return f"dot_number={usdot_number}"


def _fetched(db: Session, dataset_id: str, usdot_number: int) -> bool:
    runs = IngestionRunRepository(db)
    return runs.last_success_at(SOURCE, dataset_id, _query(usdot_number)) is not None


def sms_for(db: Session, usdot_number: int) -> SmsOut | None:
    """FMCSA's SMS results as last fetched; None when not fetched yet."""
    if not _fetched(db, SmsAdapter.crash_id(), usdot_number):
        return None
    carrier = CarrierRepository(db).get_by_usdot(usdot_number)
    rows = SafetyRecordRepository(db).latest_sms(carrier.id) if carrier else []
    if not rows:
        return sms_result([("", "", [])])  # fetched; the carrier is in no SMS file
    first = rows[0]
    return SmsOut(
        dataset_id=first.dataset_id,
        dataset=first.dataset,
        passenger=first.passenger,
        inspections=first.inspections,
        driver_inspections=first.driver_inspections,
        vehicle_inspections=first.vehicle_inspections,
        basics=[
            BasicOut(
                key=r.basic,
                label=r.label,
                inspections_with_violation=r.inspections_with_violation,
                measure=float(r.measure) if r.measure is not None else None,
                percentile=float(r.percentile) if r.percentile is not None else None,
                over_threshold=r.over_threshold,
                alert=r.alert,
                acute_critical=r.acute_critical,
                note=r.note,
            )
            for r in rows
        ],
    )


def crashes_for(db: Session, usdot_number: int, today: date) -> CrashSummaryOut | None:
    """Crashes in the last CRASH_YEARS years; None when not fetched yet."""
    if not _fetched(db, SmsAdapter.crash_id(), usdot_number):
        return None
    carrier = CarrierRepository(db).get_by_usdot(usdot_number)
    since = today - timedelta(days=round(CRASH_YEARS * 365.25))
    rows = SafetyRecordRepository(db).crashes(carrier.id, since) if carrier else []
    return crash_summary(
        [
            CrashOut(
                report_number=c.crash_id,
                report_date=c.crash_date,
                state=c.state,
                city=c.city,
                fatalities=c.fatalities,
                injuries=c.injuries,
                tow_away=c.tow_away,
                hazmat_released=c.hazmat_released,
            )
            for c in rows
        ],
        today,
        CRASH_YEARS,
    )


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
        self.records = SafetyRecordRepository(db)

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return _query(usdot_number)

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
        key = str(usdot_number)
        raw_ids = {}
        for dataset_id, run, rows in [*fetched, (a.crash_dataset_id, crash_run, crashes)]:
            stored = batch.store(dataset_id, [{"rows": rows}], run, lambda _: key)
            raw_ids[dataset_id] = stored[key][0].id

        carrier = CarrierRepository(self.db).get_by_usdot(usdot_number)
        if carrier is not None:
            month = self.today().replace(day=1)
            names = dict(zip(a.sms_dataset_ids, DATASET_NAMES, strict=True))
            sms = sms_result([(d, names[d], rows) for d, _, rows in fetched])
            if sms is not None and sms.dataset_id is not None:
                self.records.sync_sms(carrier.id, month, sms, a.source, raw_ids[sms.dataset_id])
            else:
                self.records.clear_sms_month(carrier.id, month)
            self.records.sync_crashes(
                carrier.id, crash_reports(crashes), a.source, raw_ids[a.crash_dataset_id]
            )

        batch.succeed({run: len(rows) for _, run, rows in fetched} | {crash_run: len(crashes)})
        self.db.commit()
        sms_rows = sum(len(rows) for _, _, rows in fetched)
        logger.info("USDOT %d: %d SMS rows, %d crash rows", usdot_number, sms_rows, len(crashes))
        return SmsResult(sms_rows, len(crashes))


def build_sms_service(db: Session, client: SocrataClient | None = None) -> SmsService:
    return SmsService(
        db,
        SmsAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
    )
