"""Equipment for one carrier (spec Sections 12.3, 12.5): its VINs with their NHTSA decode, the
other USDOT numbers each VIN was inspected under, and registered vs. observed fleet.

All of it is context: equipment legitimately moves between carriers (leases, sales), and only
some of a carrier's vehicles are ever inspected. Nothing here is a risk judgement.
"""

from collections import defaultdict
from datetime import date, timedelta

from app.core.exceptions import CarrierNotFoundError
from app.models import Carrier, Relationship, Vehicle
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.carrier_equipment import (
    CarrierEquipmentOut,
    EquipmentVehicleOut,
    FleetOut,
    VinCarrierOut,
)
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.vehicle_observation_service import USDOT, VEHICLE, VIN_OBSERVED_WITH

RECENT_MONTHS = 24


class EquipmentReader:
    """A carrier's equipment from stored data only (also used by the fleet consistency rule)."""

    def __init__(
        self,
        carriers: CarrierRepository,
        vehicles: VehicleRepository,
        relationships: RelationshipRepository,
        today: date | None = None,
    ) -> None:
        self.carriers = carriers
        self.vehicles = vehicles
        self.relationships = relationships
        self.today = today

    def read(self, carrier: Carrier) -> CarrierEquipmentOut:
        usdot_number = carrier.usdot_number
        own = self.relationships.to_target(VIN_OBSERVED_WITH, (USDOT, usdot_number))
        vehicles = self.vehicles.by_ids(link.source_entity_id for link in own)
        others: dict[int, list[Relationship]] = defaultdict(list)
        for link in self.relationships.from_sources(VIN_OBSERVED_WITH, VEHICLE, vehicles):
            if link.target_entity_type == USDOT and link.target_entity_id != usdot_number:
                others[link.source_entity_id].append(link)
        names = self.carriers.legal_names(
            link.target_entity_id for links in others.values() for link in links
        )

        own.sort(key=lambda link: (link.last_seen, vehicles[link.source_entity_id].vin))
        rows = [
            _vehicle(link, vehicles[link.source_entity_id], others[link.source_entity_id], names)
            for link in reversed(own)  # most recently seen first
        ]
        return CarrierEquipmentOut(
            usdot_number=usdot_number,
            fleet=summarize_fleet(carrier.fleet_size, rows, self.today or date.today()),
            shared_vin_count=sum(1 for r in rows if r.other_carriers),
            other_carrier_count=len({c.usdot_number for r in rows for c in r.other_carriers}),
            invalid_check_digit_count=sum(1 for r in rows if r.check_digit_valid is False),
            vehicles=rows,
        )


class CarrierEquipmentService:
    def __init__(self, refresh: CarrierRefreshService, reader: EquipmentReader) -> None:
        self.refresh = refresh
        self.reader = reader

    def get(self, usdot_number: int) -> CarrierEquipmentOut:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")
        return self.reader.read(carrier)


def summarize_fleet(
    registered: int | None, rows: list[EquipmentVehicleOut], today: date
) -> FleetOut:
    since = today - timedelta(days=round(RECENT_MONTHS * 365.25 / 12))
    kinds = [_kind(r) for r in rows]
    return FleetOut(
        registered_power_units=registered,
        observed_vehicles=len(rows),
        observed_power_units=kinds.count("power"),
        observed_trailers=kinds.count("trailer"),
        observed_unknown_type=kinds.count("unknown"),
        recent_power_units=sum(
            1 for r, k in zip(rows, kinds, strict=True) if k == "power" and r.last_seen >= since
        ),
        recent_months=RECENT_MONTHS,
        first_observed=min((r.first_seen for r in rows), default=None),
        last_observed=max((r.last_seen for r in rows), default=None),
    )


def _kind(row: EquipmentVehicleOut) -> str:
    """power | trailer | unknown, from the vPIC vehicle type."""
    if not row.vehicle_type:
        return "unknown"
    return "trailer" if row.vehicle_type.upper() == "TRAILER" else "power"


def _vehicle(
    link: Relationship,
    vehicle: Vehicle,
    others: list[Relationship],
    names: dict[int, str],
) -> EquipmentVehicleOut:
    return EquipmentVehicleOut(
        vin=vehicle.vin,
        inspections=link.observation_count,
        first_seen=link.first_seen,
        last_seen=link.last_seen,
        decoded=vehicle.decoded_at is not None,
        make=vehicle.decoded_make,
        model=vehicle.decoded_model,
        year=vehicle.decoded_year,
        body_class=vehicle.decoded_body_class,
        vehicle_type=vehicle.decoded_vehicle_type,
        gvwr=vehicle.decoded_gvwr,
        check_digit_valid=vehicle.check_digit_valid,
        other_carriers=[
            VinCarrierOut(
                usdot_number=o.target_entity_id,
                legal_name=names.get(o.target_entity_id),
                inspections=o.observation_count,
                first_seen=o.first_seen,
                last_seen=o.last_seen,
                confidence=o.confidence.value,
            )
            for o in sorted(others, key=lambda o: (o.last_seen, o.target_entity_id), reverse=True)
        ],
    )
