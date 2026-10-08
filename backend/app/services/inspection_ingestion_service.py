"""Fetch a carrier's inspections with their vehicle units and violations, store every row as
received, and normalize them into the inspections table (spec Sections 19.2, 19.3).

The carrier must already exist (census runs first). Each dataset fetch is its own ingestion
run, committed first so failures are recorded; if any fetch fails, nothing is stored and every
run started for this carrier is marked failed. Raw rows are stored only when new or changed.
Every inspection is normalized again on each fetch and written only when the result differs
from what is stored, so a change to the normalizer also reaches inspections whose source rows
did not change.
"""

import logging
from collections import defaultdict
from collections.abc import Callable, Sequence
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

# Raw record per source key, and whether it was newly stored (new or changed).
StoredRaws = dict[str, tuple[RawRecord, bool]]


@dataclass(frozen=True)
class InspectionIngestResult:
    header_run: IngestionRun
    unit_run: IngestionRun | None  # None when the carrier has no inspections
    violation_run: IngestionRun | None  # None when the carrier has no inspections
    inspections_fetched: int
    units_fetched: int
    violations_fetched: int
    # Inspections inserted or updated because their normalized values changed.
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
        started: list[IngestionRun] = []
        header_run, headers = self._fetch(
            self.adapter.dataset_id,
            query,
            lambda: self.adapter.fetch_by_usdot(usdot_number),
            started,
            usdot_number,
        )
        if not headers:
            self.runs.succeed(header_run, records_fetched=0)
            self.db.commit()
            return InspectionIngestResult(header_run, None, None, 0, 0, 0, 0)

        ids = [row["inspection_id"] for row in headers]
        detail_query = f"{len(ids)} inspections for {query}"
        unit_run, units = self._fetch(
            self.adapter.unit_dataset_id,
            f"units of {detail_query}",
            lambda: self.adapter.fetch_units(ids),
            started,
            usdot_number,
        )
        violation_run, violations = self._fetch(
            self.adapter.violation_dataset_id,
            f"violations of {detail_query}",
            lambda: self.adapter.fetch_violations(ids),
            started,
            usdot_number,
        )

        header_raws = self._store(self.adapter.dataset_id, "inspection_id", headers, header_run)
        self._store(self.adapter.unit_dataset_id, "insp_unit_id", units, unit_run)
        self._store(
            self.adapter.violation_dataset_id, "insp_violation_id", violations, violation_run
        )

        counts = {header_run: len(headers), unit_run: len(units), violation_run: len(violations)}
        try:
            written = self._normalize(carrier.id, headers, units, violations, header_raws)
        except SourceDataError as exc:
            self.runs.fail(header_run, exc.message)
            for run in (unit_run, violation_run):
                self.runs.succeed(run, records_fetched=counts[run])
            self.db.commit()  # keeps the raw records for auditing and reprocessing
            logger.error("Inspections for USDOT %s could not be normalized", usdot_number)
            raise

        for run, fetched in counts.items():
            self.runs.succeed(run, records_fetched=fetched)
        self.db.commit()
        logger.info(
            "USDOT %s: %d inspections, %d units, %d violations fetched; %d inspections written",
            usdot_number,
            len(headers),
            len(units),
            len(violations),
            written,
        )
        return InspectionIngestResult(
            header_run,
            unit_run,
            violation_run,
            len(headers),
            len(units),
            len(violations),
            written,
        )

    def _fetch(
        self,
        dataset_id: str,
        query: str,
        fetch: Callable[[], list[Row]],
        started: list[IngestionRun],
        usdot_number: int,
    ) -> tuple[IngestionRun, list[Row]]:
        """Run one dataset fetch as its own ingestion run. On failure, fail every run started for
        this carrier so far (nothing has been stored yet) and re-raise."""
        run = self.runs.start(self.adapter.source, dataset_id, query)
        self.db.commit()
        started.append(run)
        try:
            return run, fetch()
        except SourceFetchError as exc:
            for earlier in started[:-1]:
                self.runs.fail(earlier, f"Fetch failed in run {run.id}; nothing stored")
            self.runs.fail(run, exc.message)
            self.db.commit()
            logger.error("Inspection fetch failed for USDOT %s (run %d)", usdot_number, run.id)
            raise

    def _store(
        self, dataset_id: str, key: str, rows: Sequence[Row], run: IngestionRun
    ) -> StoredRaws:
        latest = self.raw_records.latest_many(
            self.adapter.source, dataset_id, [row[key] for row in rows]
        )
        stored: StoredRaws = {}
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
        violations: Sequence[Row],
        header_raws: StoredRaws,
    ) -> int:
        units_by_inspection = _group(units)
        violations_by_inspection = _group(violations)
        existing = self.inspections.by_inspection_ids(
            self.adapter.source, [row["inspection_id"] for row in headers]
        )
        written = 0
        for header in headers:
            inspection_id = header["inspection_id"]
            own_units = units_by_inspection[inspection_id]
            own_violations = violations_by_inspection[inspection_id]
            raw_record, _ = header_raws[inspection_id]
            values = normalize_inspection(header, own_units, own_violations)
            current = existing.get(inspection_id)
            if current is not None and self.inspections.matches(current, values, raw_record.id):
                continue
            self.inspections.upsert(
                current,
                values,
                carrier_id=carrier_id,
                source=self.adapter.source,
                raw_record_id=raw_record.id,
            )
            written += 1
        self.db.flush()
        return written


def _group(rows: Sequence[Row]) -> dict[str, list[Row]]:
    by_inspection: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        by_inspection[row.get("inspection_id", "")].append(row)
    return by_inspection


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
