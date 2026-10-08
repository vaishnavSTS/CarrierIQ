"""Fetch a carrier's inspections and their vehicle units, store them as received, and normalize
them into the inspections table (spec Sections 19.2, 19.3).

The carrier must already exist (census runs first). Each dataset fetch is its own ingestion
run, committed first so failures are recorded. Raw rows are stored only when new or changed;
an inspection is (re)normalized only when its header or one of its units changed.
"""

import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, SourceDataError, SourceFetchError
from app.ingestion.fingerprint import payload_hash
from app.ingestion.socrata_client import Row, SocrataClient
from app.ingestion.vehicle_inspection_normalizer import normalize_inspection
from app.ingestion.vehicle_inspections import VehicleInspectionAdapter
from app.models import IngestionRun, RawRecord
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.raw_record_repository import RawRecordRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class InspectionIngestResult:
    header_run: IngestionRun
    unit_run: IngestionRun | None  # None when the carrier has no inspections
    inspections_fetched: int
    units_fetched: int
    # Inspections inserted or updated because their header or a unit was new or changed.
    inspections_written: int


class InspectionIngestionService:
    def __init__(
        self,
        db: Session,
        adapter: VehicleInspectionAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        carriers: CarrierRepository,
        inspections: InspectionRepository,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.carriers = carriers
        self.inspections = inspections

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        """When this carrier's inspections were last fetched successfully."""
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.dataset_id, self.adapter.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> InspectionIngestResult:
        carrier = self.carriers.get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; ingest its census record first"
            )

        query = self.adapter.query_for(usdot_number)
        header_run, headers = self._fetch(self.adapter.dataset_id, query, usdot_number)
        if not headers:
            self.runs.succeed(header_run, records_fetched=0)
            self.db.commit()
            return InspectionIngestResult(header_run, None, 0, 0, 0)

        inspection_ids = [row["inspection_id"] for row in headers]
        unit_query = f"units of {len(inspection_ids)} inspections for {query}"
        unit_run = self.runs.start(self.adapter.source, self.adapter.unit_dataset_id, unit_query)
        self.db.commit()
        try:
            units = self.adapter.fetch_units(inspection_ids)
        except SourceFetchError as exc:
            self.runs.fail(header_run, f"Unit fetch failed (run {unit_run.id}); nothing stored")
            self._fail(unit_run, exc.message, usdot_number)
            raise

        header_raws = self._store(self.adapter.dataset_id, "inspection_id", headers, header_run)
        unit_raws = self._store(self.adapter.unit_dataset_id, "insp_unit_id", units, unit_run)

        try:
            written = self._normalize(carrier.id, headers, units, header_raws, unit_raws)
        except SourceDataError as exc:
            self.runs.fail(header_run, exc.message)
            self.runs.succeed(unit_run, records_fetched=len(units))
            self.db.commit()  # keeps the raw records for auditing and reprocessing
            logger.error("Inspections for USDOT %s could not be normalized", usdot_number)
            raise

        self.runs.succeed(header_run, records_fetched=len(headers))
        self.runs.succeed(unit_run, records_fetched=len(units))
        self.db.commit()
        logger.info(
            "USDOT %s: %d inspections, %d units fetched; %d inspections written",
            usdot_number,
            len(headers),
            len(units),
            written,
        )
        return InspectionIngestResult(header_run, unit_run, len(headers), len(units), written)

    def _fetch(
        self, dataset_id: str, query: str, usdot_number: int
    ) -> tuple[IngestionRun, list[Row]]:
        run = self.runs.start(self.adapter.source, dataset_id, query)
        self.db.commit()
        try:
            return run, self.adapter.fetch_by_usdot(usdot_number)
        except SourceFetchError as exc:
            self._fail(run, exc.message, usdot_number)
            raise

    def _fail(self, run: IngestionRun, message: str, usdot_number: int) -> None:
        self.runs.fail(run, message)
        self.db.commit()
        logger.error("Inspection fetch failed for USDOT %s (run %d)", usdot_number, run.id)

    def _store(
        self, dataset_id: str, key: str, rows: Sequence[Row], run: IngestionRun
    ) -> dict[str, tuple[RawRecord, bool]]:
        """Raw record per row key, and whether it was newly stored (new or changed)."""
        latest = self.raw_records.latest_many(
            self.adapter.source, dataset_id, [row[key] for row in rows]
        )
        stored: dict[str, tuple[RawRecord, bool]] = {}
        new_records: list[RawRecord] = []
        for row in rows:
            fingerprint = payload_hash(row)
            previous = latest.get(row[key])
            if previous is not None and previous.payload_hash == fingerprint:
                stored[row[key]] = (previous, False)
                continue
            record = RawRecord(
                source=self.adapter.source,
                dataset_id=dataset_id,
                external_id=row[key],
                payload=row,
                payload_hash=fingerprint,
                ingestion_run_id=run.id,
            )
            new_records.append(record)
            stored[row[key]] = (record, True)
        self.raw_records.add_many(new_records)
        return stored

    def _normalize(
        self,
        carrier_id: int,
        headers: Sequence[Row],
        units: Sequence[Row],
        header_raws: dict[str, tuple[RawRecord, bool]],
        unit_raws: dict[str, tuple[RawRecord, bool]],
    ) -> int:
        units_by_inspection: dict[str, list[Row]] = defaultdict(list)
        for unit in units:
            units_by_inspection[unit.get("inspection_id", "")].append(unit)

        existing = self.inspections.by_inspection_ids(
            self.adapter.source, [row["inspection_id"] for row in headers]
        )
        written = 0
        for header in headers:
            inspection_id = header["inspection_id"]
            own_units = units_by_inspection[inspection_id]
            raw_record, header_changed = header_raws[inspection_id]
            units_changed = any(unit_raws[u["insp_unit_id"]][1] for u in own_units)
            current = existing.get(inspection_id)
            if current is not None and not header_changed and not units_changed:
                continue
            self.inspections.upsert(
                current,
                normalize_inspection(header, own_units),
                carrier_id=carrier_id,
                source=self.adapter.source,
                raw_record_id=raw_record.id,
            )
            written += 1
        self.db.flush()
        return written


def build_inspection_ingestion_service(
    db: Session, client: SocrataClient | None = None
) -> InspectionIngestionService:
    """Wire the service with its real collaborators (live API unless a client is given)."""
    return InspectionIngestionService(
        db,
        VehicleInspectionAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        InspectionRepository(db),
    )
