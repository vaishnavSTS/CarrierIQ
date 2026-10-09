"""Equipment detail for one carrier (spec Section 6 "Equipment", Sections 12.3 and 12.5)."""

from datetime import date

from pydantic import BaseModel


class VinCarrierOut(BaseModel):
    """Another USDOT number the same VIN was inspected under."""

    usdot_number: int
    legal_name: str | None  # only when that carrier is loaded in CarrierIQ
    inspections: int
    first_seen: date
    last_seen: date
    confidence: str  # HIGH (2+ inspections) | MEDIUM (1)


class EquipmentVehicleOut(BaseModel):
    vin: str
    inspections: int  # this carrier's inspections the VIN appeared on
    first_seen: date
    last_seen: date
    decoded: bool  # False until NHTSA vPIC has decoded it
    make: str | None
    model: str | None
    year: int | None
    body_class: str | None
    vehicle_type: str | None  # vPIC, e.g. TRUCK, TRAILER, BUS
    gvwr: str | None  # weight class text, e.g. "Class 8: 33,001 lb and above ..."
    check_digit_valid: bool | None  # False: the VIN was probably mistyped on the report
    other_carriers: list[VinCarrierOut]  # most recently seen first


class FleetOut(BaseModel):
    """Registered fleet vs. what inspections show. Context only, never a verdict (spec 12.5)."""

    registered_power_units: int | None  # census, as reported by the carrier
    observed_vehicles: int  # distinct VINs on the carrier's inspections
    observed_power_units: int  # decoded as anything but a trailer
    observed_trailers: int
    observed_unknown_type: int  # not decoded (yet) or no vehicle type
    recent_power_units: int  # power units seen in the last `recent_months`
    recent_months: int
    first_observed: date | None
    last_observed: date | None


class CarrierEquipmentOut(BaseModel):
    usdot_number: int
    fleet: FleetOut
    shared_vin_count: int  # VINs also inspected under another USDOT number
    other_carrier_count: int
    invalid_check_digit_count: int
    vehicles: list[EquipmentVehicleOut]  # most recently seen first
