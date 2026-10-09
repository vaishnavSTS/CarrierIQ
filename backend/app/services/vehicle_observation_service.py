"""VIN extraction and VIN -> carrier links (spec Phase 7, Section 12.3).

Every vehicle unit on a carrier's inspections (power units and trailers) is a VIN observation.
Each VIN becomes a `vehicles` row, and each "VIN seen with USDOT n" a `relationships` row
(VIN_OBSERVED_WITH) with first / last seen dates and the number of inspections. Links point at
the USDOT number, not a carrier row, so a VIN can also be linked to carriers that aren't loaded.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.vehicle_inspection_normalizer import normalize_vin
from app.models import Carrier
from app.models.enums import Confidence
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import LinkValues, RelationshipRepository
from app.repositories.vehicle_repository import VehicleRepository

logger = logging.getLogger(__name__)

VIN_OBSERVED_WITH = "VIN_OBSERVED_WITH"
VEHICLE = "vehicle"
USDOT = "usdot"
SOURCE = "dot_socrata"


@dataclass
class VinObservations:
    """Inspections a VIN appeared on for one USDOT number."""

    dates: dict[str, date] = field(default_factory=dict)  # inspection id -> inspection date
    latest_raw_id: int | None = None
    latest_date: date | None = None

    def add(self, inspection_id: str, day: date, raw_id: int) -> None:
        self.dates[inspection_id] = day
        if self.latest_date is None or day >= self.latest_date:
            self.latest_date = day
            self.latest_raw_id = raw_id


def confidence_for(inspections: int) -> Confidence:
    """Spec 13.1 example for shared VINs: 2+ inspections = HIGH, 1 = MEDIUM."""
    return Confidence.HIGH if inspections >= 2 else Confidence.MEDIUM


def save_observations(
    relationships: RelationshipRepository,
    vehicles: VehicleRepository,
    by_usdot: dict[int, dict[str, VinObservations]],
) -> int:
    """Save VIN observations for any number of USDOT numbers in one batch."""
    found = vehicles.get_or_create({vin for by_vin in by_usdot.values() for vin in by_vin})
    links = []
    for usdot_number, by_vin in by_usdot.items():
        for vin, seen in by_vin.items():
            links.append(_link(found[vin].id, usdot_number, seen))
    return relationships.upsert_many(links)


def _link(vehicle_id: int, usdot_number: int, seen: VinObservations) -> LinkValues:
    dates = sorted(seen.dates.values())
    return LinkValues(
        source=(VEHICLE, vehicle_id),
        relationship_type=VIN_OBSERVED_WITH,
        target=(USDOT, usdot_number),
        first_seen=dates[0],
        last_seen=dates[-1],
        observation_count=len(dates),
        confidence=confidence_for(len(dates)),
        raw_record_id=seen.latest_raw_id,
    )


class VehicleObservationService:
    def __init__(
        self,
        db: Session,
        inspections: InspectionRepository,
        raw_records: RawRecordRepository,
        vehicles: VehicleRepository,
        relationships: RelationshipRepository,
    ) -> None:
        self.db = db
        self.inspections = inspections
        self.raw_records = raw_records
        self.vehicles = vehicles
        self.relationships = relationships
        self.unit_dataset_id = get_settings().inspection_unit_dataset_id

    def rebuild_own(self, carrier: Carrier) -> int:
        """Record every VIN on the carrier's own inspections; returns how many VINs."""
        dates = {
            i.inspection_id: i.inspection_date for i in self.inspections.for_carrier(carrier.id)
        }
        units = self.raw_records.latest_for_inspections(SOURCE, self.unit_dataset_id, list(dates))
        by_vin: dict[str, VinObservations] = defaultdict(VinObservations)
        for unit in units:
            vin = normalize_vin(unit.payload.get("insp_unit_vehicle_id_number"))
            inspection_id = unit.payload.get("inspection_id")
            if vin and inspection_id in dates:
                by_vin[vin].add(inspection_id, dates[inspection_id], unit.id)
        save_observations(self.relationships, self.vehicles, {carrier.usdot_number: by_vin})
        self.db.commit()
        logger.info(
            "USDOT %d: %d VINs observed on its inspections", carrier.usdot_number, len(by_vin)
        )
        return len(by_vin)


def build_vehicle_observation_service(db: Session) -> VehicleObservationService:
    return VehicleObservationService(
        db,
        InspectionRepository(db),
        RawRecordRepository(db),
        VehicleRepository(db),
        RelationshipRepository(db),
    )
