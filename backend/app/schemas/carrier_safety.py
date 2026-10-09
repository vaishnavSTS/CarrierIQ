"""Safety detail and inspection history (spec Phase 5: inspection history, OOS, counts, trends)."""

from datetime import date

from pydantic import BaseModel


class QuarterOut(BaseModel):
    quarter: str  # e.g. "2025-Q3"
    start_date: date
    inspections: int
    vehicle_inspections: int = 0  # inspections that examined the vehicle (Levels I, II, V, VI)
    driver_inspections: int = 0  # inspections that examined the driver (Levels I, II, III, VI)
    vehicle_oos: int
    driver_oos: int
    # FMCSA's method: OOS orders / inspections that examined the vehicle (or driver), 0..1;
    # None when there were none.
    vehicle_oos_rate: float | None
    driver_oos_rate: float | None
    violations: int  # violation rows recorded on the quarter's inspections


class CountOut(BaseModel):
    key: str  # inspection level ("1".."8") or state code
    inspections: int


class ViolationPartOut(BaseModel):
    part: int | None  # 49 CFR part; None when the source gave none
    title: str | None
    violations: int
    out_of_service: int


class ViolationCodeOut(BaseModel):
    code: str | None
    description: str | None
    part: int | None
    violations: int
    out_of_service: int
    last_seen: date


class ViolationSummaryOut(BaseModel):
    # Violation rows from the violations dataset. The inspection headers' own count can differ
    # slightly (the source lists a few violations it has no row for); both are reported.
    total: int
    header_total: int
    driver: int
    vehicle: int
    out_of_service: int
    by_part: list[ViolationPartOut]  # most violations first
    top_codes: list[ViolationCodeOut]  # most frequent first


class BasicOut(BaseModel):
    """One CSA BASIC as FMCSA's SMS publishes it."""

    key: str
    label: str
    inspections_with_violation: int
    measure: float | None
    percentile: float | None  # 0-100; FMCSA publishes it for passenger carriers only
    over_threshold: bool | None  # passenger files only: percentile over FMCSA's threshold
    alert: bool | None  # passenger files only: FMCSA's overall BASIC alert
    acute_critical: bool | None  # acute/critical violation found in an investigation, 12 months
    note: str | None  # e.g. why there is no percentile


class SmsOut(BaseModel):
    """FMCSA SMS (CSA) results for the carrier, 24-month measurement period."""

    dataset_id: str | None  # None: the carrier is in none of FMCSA's SMS files
    dataset: str | None
    passenger: bool
    inspections: int
    driver_inspections: int
    vehicle_inspections: int
    basics: list[BasicOut]


class CrashOut(BaseModel):
    report_number: str
    report_date: date
    state: str | None
    city: str | None
    fatalities: int
    injuries: int
    tow_away: bool
    hazmat_released: bool


class CrashSummaryOut(BaseModel):
    """Crashes in FMCSA's Crash File, grouped by crash report."""

    years: int  # history fetched
    total: int
    fatal: int
    injury: int
    recent_months: int
    recent_total: int
    recent_fatal: int
    recent_injury: int
    crashes: list[CrashOut]  # newest first


class CarrierSafetyOut(BaseModel):
    usdot_number: int
    inspection_count: int
    quarters: list[QuarterOut]  # oldest first, from the first inspection to the current quarter
    by_level: list[CountOut]  # by level number
    by_state: list[CountOut]  # most inspections first
    violations: ViolationSummaryOut
    sms: SmsOut | None = None  # None: not fetched yet
    crashes: CrashSummaryOut | None = None  # None: not fetched yet


class ViolationOut(BaseModel):
    code: str | None
    description: str | None
    part: int | None
    part_title: str | None
    applies_to: str | None  # DRIVER | VEHICLE
    unit_number: int | None
    out_of_service: bool
    citation_number: str | None


class InspectionDetailOut(BaseModel):
    inspection_id: str
    inspection_date: date
    level: int | None
    state: str | None
    location: str | None
    vin: str | None
    vehicle_oos: bool
    driver_oos: bool
    violation_count: int  # from the inspection header
    violations: list[ViolationOut]


class InspectionPageOut(BaseModel):
    usdot_number: int
    page: int
    page_size: int
    total: int  # inspections matching the filter
    inspections: list[InspectionDetailOut]  # newest first
