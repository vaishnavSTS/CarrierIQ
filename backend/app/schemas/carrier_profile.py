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
    # Where the status comes from: MOTUS | LEGACY_LI | CENSUS, and how current it is.
    source_system: str | None = None
    as_of: date | None = None


class InsuranceOut(BaseModel):
    # ON_FILE: every active docket has the required filing on file; NOT_ON_FILE: one has none;
    # None: no active authority.
    status: str | None
    source_system: str | None  # MOTUS | LEGACY_LI | MIXED
    as_of: date | None


class TimelineEventOut(BaseModel):
    event_type: str
    event_date: date
    severity: str
    title: str
    description: str | None
    signal_id: int | None = None  # the intelligence signal raised for this event, if any


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


class OosWindowOut(BaseModel):
    """Out-of-service figures for a recent window, by FMCSA's method."""

    months: int
    inspections: int
    vehicle_inspections: int
    driver_inspections: int
    vehicle_oos: int
    driver_oos: int
    vehicle_oos_rate: float | None
    driver_oos_rate: float | None
    national_vehicle_oos_rate: float  # FMCSA SAFER national average
    national_driver_oos_rate: float


class SafetyOut(BaseModel):
    inspection_count: int
    vehicle_inspection_count: int = 0  # inspections that examined the vehicle
    driver_inspection_count: int = 0  # inspections that examined the driver
    vehicle_oos_count: int
    driver_oos_count: int
    # FMCSA's method: OOS orders / inspections that examined the vehicle (or driver), 0..1;
    # None when there were none.
    vehicle_oos_rate: float | None
    driver_oos_rate: float | None
    recent: OosWindowOut | None = None  # last 24 months
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
    operation_classification: str | None  # census CLASSDEF, ";"-separated
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
    timeline: list[TimelineEventOut]  # authority / insurance events, newest first
    # OPEN_SIGNALS | NO_OPEN_SIGNALS: active signals above INFO not yet reviewed.
    review_status: str | None = None
    open_signal_count: int = 0
    highest_open_severity: str | None = None
