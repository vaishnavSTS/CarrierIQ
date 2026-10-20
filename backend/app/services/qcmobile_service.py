"""FMCSA QCMobile carrier snapshots, stored like the other refresh detail sources.

Each fetch is an ingestion run; the snapshot (`content.carrier`) is one raw record keyed by USDOT
number, stored only when new or changed. It is an optional extra: a failed fetch is recorded and
logged but never raised, so it can't mark a carrier refresh stale. Only used when
QCMOBILE_WEB_KEY is set (services/carrier_refresh_factory.py).
"""

import logging
from collections.abc import Callable, Sequence
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError
from app.ingestion.qcmobile import DATASET_ID, SOURCE, QcMobileClient, Row, normalize_ein
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataset_batch import DatasetBatch

logger = logging.getLogger(__name__)


def query_for(usdot_number: int) -> str:
    return f"dot_number={usdot_number}"


def stored_ein(db: Session, usdot_number: int) -> tuple[str | None, datetime | None]:
    """The carrier's EIN from its latest stored snapshot, and when QCMobile last answered."""
    record = RawRecordRepository(db).latest(SOURCE, DATASET_ID, str(usdot_number))
    if record is None:
        return None, None
    as_of = IngestionRunRepository(db).last_success_at(SOURCE, DATASET_ID, query_for(usdot_number))
    return normalize_ein(record.payload.get("ein")), as_of or record.fetched_at


def stored_eins(db: Session, usdot_numbers: Sequence[int]) -> dict[int, str | None]:
    """EINs from stored snapshots, for the carriers that have one."""
    records = RawRecordRepository(db).latest_many(
        SOURCE, DATASET_ID, [str(n) for n in usdot_numbers]
    )
    return {int(key): normalize_ein(r.payload.get("ein")) for key, r in records.items()}


class QcMobileService:
    def __init__(
        self,
        db: Session,
        client: QcMobileClient,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
    ) -> None:
        self.db = db
        self.client = client
        self.runs = runs
        self.raw_records = raw_records

    @property
    def enabled(self) -> bool:
        return self.client.enabled

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(SOURCE, DATASET_ID, query_for(usdot_number))

    def ingest(self, usdot_number: int) -> str | None:
        """Fetch and store the snapshot; returns the EIN. Never raises a fetch failure."""
        try:
            return self._store(usdot_number, lambda: self.client.fetch_carrier(usdot_number))
        except SourceFetchError as exc:
            logger.warning("USDOT %d: QCMobile snapshot not fetched: %s", usdot_number, exc.message)
            return None

    def store_fetched(self, usdot_number: int, row: Row | None) -> str | None:
        """Store a snapshot fetched elsewhere (e.g. several at once); returns the EIN."""
        return self._store(usdot_number, lambda: row)

    def fetch_many(self, usdot_numbers: Sequence[int]) -> tuple[dict[int, str | None], list[int]]:
        """Fetch and store snapshots for several carriers: (EIN by USDOT, USDOTs that failed)."""
        found, failed = self.client.fetch_many(usdot_numbers)
        return {n: self.store_fetched(n, row) for n, row in found.items()}, failed

    def _store(self, usdot_number: int, fetch: Callable[[], Row | None]) -> str | None:
        batch = DatasetBatch(self.db, self.runs, self.raw_records, SOURCE, f"USDOT {usdot_number}")
        run, rows = batch.fetch(
            DATASET_ID, query_for(usdot_number), lambda: [r] if (r := fetch()) else []
        )
        key = str(usdot_number)
        batch.store(DATASET_ID, rows, run, lambda _: key)
        batch.succeed({run: len(rows)})
        self.db.commit()
        return normalize_ein(rows[0].get("ein")) if rows else None


def build_qcmobile_service(db: Session, client: QcMobileClient | None = None) -> QcMobileService:
    return QcMobileService(
        db, client or QcMobileClient(), IngestionRunRepository(db), RawRecordRepository(db)
    )
