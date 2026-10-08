"""Carrier profile response (spec Section 6, Section 21 "Carrier Overview")."""

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.carrier_search import DocketOut


class AddressOut(BaseModel):
    address_type: str
    street: str | None
    city: str | None
    state: str | None
    zip: str | None
    country: str | None
    undeliverable: bool
    first_seen: date
    last_seen: date


class PhoneOut(BaseModel):
    phone_type: str
    number: str
    first_seen: date


class AuthorityOut(BaseModel):
    # ACTIVE when any docket is active; otherwise the first docket's status; None: no dockets.
    status: str | None
    dockets: list[DocketOut]


class InsuranceOut(BaseModel):
    available: bool = False  # insurance data arrives in Phase 6
    status: str | None = None


class InspectionOut(BaseModel):
    inspection_id: str
    inspection_date: date
    level: int | None
    state: str | None
    location: str | None
    vin: str | None
    vehicle_oos: bool
    driver_oos: bool
    violations: int


class InspectionYearOut(BaseModel):
    year: int
    inspections: int
    vehicle_oos: int
    driver_oos: int


class SafetyOut(BaseModel):
    inspection_count: int
    vehicle_oos_count: int
    driver_oos_count: int
    # Share of inspections with an out-of-service order, 0..1; None without inspections.
    vehicle_oos_rate: float | None
    driver_oos_rate: float | None
    first_inspection_date: date | None
    last_inspection_date: date | None
    by_year: list[InspectionYearOut]
    recent_inspections: list[InspectionOut]
    crash_count: int | None = None  # crash data is not loaded yet
    safety_rating: str | None
    safety_rating_date: date | None


class VehicleOut(BaseModel):
    vin: str
    inspections: int
    first_seen: date
    last_seen: date


class EquipmentOut(BaseModel):
    power_units: int | None
    observed_vehicle_count: int  # distinct VINs on this carrier's inspections
    vehicles: list[VehicleOut]  # most recently seen first


class ChangeOut(BaseModel):
    attribute: str
    old_value: str | None
    new_value: str | None
    changed_on: date


class CarrierProfile(BaseModel):
    usdot_number: int
    legal_name: str
    dba_name: str | None
    entity_type: str | None
    registration_status: str | None
    email: str | None
    website: str | None
    driver_count: int | None
    first_registered_date: date | None
    last_mcs150_date: date | None
    last_refreshed_at: datetime | None
    stale: bool  # a refresh was due but the source failed; stored data is shown

    addresses: list[AddressOut]
    phones: list[PhoneOut]
    officers: list[str]
    domains: list[str]
    authority: AuthorityOut
    insurance: InsuranceOut
    safety: SafetyOut
    equipment: EquipmentOut
    recent_changes: list[ChangeOut]  # newest first; the first load is not a change
    review_status: str | None = None  # intelligence signals arrive in Phase 8
