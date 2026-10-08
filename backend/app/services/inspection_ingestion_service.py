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
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, SourceDataError
from app.ingestion.socrata_client import Row, SocrataClient
from app.ingestion.vehicle_inspection_normalizer import normalize_inspection
from app.ingestion.vehicle_inspections import VehicleInspectionAdapter
from app.models import IngestionRun
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataset_batch import DatasetBatch, StoredRaws, field_key

logger = logging.getLogger(__name__)


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
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, self.adapter.source, f"USDOT {usdot_number}"
        )
        header_run, headers = batch.fetch(
            self.adapter.dataset_id, query, lambda: self.adapter.fetch_by_usdot(usdot_number)
        )
        if not headers:
            self.runs.succeed(header_run, records_fetched=0)
            self.db.commit()
            return InspectionIngestResult(header_run, None, None, 0, 0, 0, 0)

        ids = [row["inspection_id"] for row in headers]
        detail_query = f"{len(ids)} inspections for {query}"
        unit_run, units = batch.fetch(
            self.adapter.unit_dataset_id,
            f"units of {detail_query}",
            lambda: self.adapter.fetch_units(ids),
        )
        violation_run, violations = batch.fetch(
            self.adapter.violation_dataset_id,
            f"violations of {detail_query}",
            lambda: self.adapter.fetch_violations(ids),
        )

        header_raws = batch.store(
            self.adapter.dataset_id, headers, header_run, field_key("inspection_id")
        )
        batch.store(self.adapter.unit_dataset_id, units, unit_run, field_key("insp_unit_id"))
        batch.store(
            self.adapter.violation_dataset_id,
            violations,
            violation_run,
            field_key("insp_violation_id"),
        )

        counts = {header_run: len(headers), unit_run: len(units), violation_run: len(violations)}
        try:
            written = self._normalize(carrier.id, headers, units, violations, header_raws)
        except SourceDataError as exc:
            self.runs.fail(header_run, exc.message)
            batch.succeed({unit_run: counts[unit_run], violation_run: counts[violation_run]})
            self.db.commit()  # keeps the raw records for auditing and reprocessing
            logger.error("Inspections for USDOT %s could not be normalized", usdot_number)
            raise

        batch.succeed(counts)
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
