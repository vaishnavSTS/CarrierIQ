"""Shared VINs (spec Section 12.3): the same VIN on other carriers' inspections.

For a carrier's VINs, every unit row in the FMCSA inspection-unit data carrying one of them is
fetched; inspections that aren't this carrier's are looked up to learn which USDOT number they
belong to and when. Each (VIN, other USDOT) pair becomes a VIN_OBSERVED_WITH link, with dates,
inspection count and confidence (2+ inspections HIGH, 1 MEDIUM). This records a relationship,
not a verdict: leased, rented or sold equipment legitimately moves between carriers.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError
from app.ingestion.fmcsa_values import yyyymmdd
from app.ingestion.socrata_client import SocrataClient
from app.ingestion.vehicle_inspection_normalizer import normalize_vin
from app.ingestion.vehicle_inspections import VehicleInspectionAdapter
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.services.dataset_batch import DatasetBatch, field_key
from app.services.vehicle_observation_service import (
    USDOT,
    VIN_OBSERVED_WITH,
    VehicleObservationService,
    VinObservations,
    build_vehicle_observation_service,
    save_observations,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SharedVinResult:
    vins_checked: int
    other_inspections: int
    other_carriers: int
    shared_vins: int


class SharedVinService:
    def __init__(
        self,
        db: Session,
        adapter: VehicleInspectionAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        carriers: CarrierRepository,
        inspections: InspectionRepository,
        vehicles: VehicleRepository,
        relationships: RelationshipRepository,
        observations: VehicleObservationService,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.carriers = carriers
        self.inspections = inspections
        self.vehicles = vehicles
        self.relationships = relationships
        self.observations = observations

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"shared VINs for dot_number={usdot_number}"

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.unit_dataset_id, self.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> SharedVinResult:
        carrier = self.carriers.get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; ingest its census record first"
            )
        self.observations.rebuild_own(carrier)  # the carrier's own VINs, from its inspections
        own_links = self.relationships.to_target(VIN_OBSERVED_WITH, (USDOT, usdot_number))
        vehicles = self.vehicles.by_ids(link.source_entity_id for link in own_links)
        vins = sorted(v.vin for v in vehicles.values())
        own_ids = {i.inspection_id for i in self.inspections.for_carrier(carrier.id)}

        a = self.adapter
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )
        unit_run, units = batch.fetch(
            a.unit_dataset_id, self.query_for(usdot_number), lambda: a.fetch_units_by_vins(vins)
        )
        other_units = [u for u in units if u.get("inspection_id") not in own_ids]
        other_ids = sorted({u["inspection_id"] for u in other_units})
        header_run, headers = batch.fetch(
            a.dataset_id,
            f"{len(other_ids)} inspections sharing VINs with dot_number={usdot_number}",
            lambda: a.fetch_headers(other_ids),
        )
        unit_raws = batch.store(a.unit_dataset_id, other_units, unit_run, field_key("insp_unit_id"))
        batch.store(a.dataset_id, headers, header_run, field_key("inspection_id"))

        header_by_id = {h["inspection_id"]: h for h in headers}
        by_carrier: dict[int, dict[str, VinObservations]] = defaultdict(
            lambda: defaultdict(VinObservations)
        )
        for unit in other_units:
            vin = normalize_vin(unit.get("insp_unit_vehicle_id_number"))
            header = header_by_id.get(unit["inspection_id"])
            dot = (header or {}).get("dot_number")
            day = yyyymmdd(header, "insp_date") if header else None
            if not vin or not dot or not str(dot).isdigit() or day is None:
                continue
            if int(dot) == usdot_number:
                continue  # an inspection of this carrier that we haven't loaded yet
            by_carrier[int(dot)][vin].add(
                unit["inspection_id"], day, unit_raws[unit["insp_unit_id"]][0].id
            )

        save_observations(self.relationships, self.vehicles, by_carrier)
        shared = {vin for by_vin in by_carrier.values() for vin in by_vin}

        batch.succeed({unit_run: len(units), header_run: len(headers)})
        self.db.commit()
        logger.info(
            "USDOT %d: %d VINs checked; %d also on %d other carriers' inspections (%d inspections)",
            usdot_number,
            len(vins),
            len(shared),
            len(by_carrier),
            len(other_ids),
        )
        return SharedVinResult(len(vins), len(other_ids), len(by_carrier), len(shared))


def build_shared_vin_service(db: Session, client: SocrataClient | None = None) -> SharedVinService:
    return SharedVinService(
        db,
        VehicleInspectionAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        InspectionRepository(db),
        VehicleRepository(db),
        RelationshipRepository(db),
        build_vehicle_observation_service(db),
    )
