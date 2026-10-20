"""Safety detail and inspection history (spec Phase 5: inspection history, OOS, counts, trends)."""

from datetime import date, datetime

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


class ViolationGroupOut(BaseModel):
    """One FMCSA violation group within a BASIC, e.g. Tires in Vehicle Maintenance."""

    group: str
    violations: int
    out_of_service: int
    weight: float  # sum of FMCSA total severity weights
    share: float  # of the BASIC's total weight, 0..1
    examples: list[str]  # most heavily weighted violation descriptions


class BasicDriverOut(BaseModel):
    """What makes up one BASIC measure, from FMCSA's SMS input violations."""

    basic: str
    violations: int
    out_of_service: int
    weight: float
    recent_violations: int  # in the last 6 months, where FMCSA's time weight is highest
    groups: list[ViolationGroupOut]  # heaviest first


class EstimatedIssBasicOut(BaseModel):
    basic: str  # unsafe_driv | hos_driv | driv_fit | contr_subst | veh_maint
    label: str
    percentile: float | None  # estimated; None: not enough data, or hidden from clients
    assessed: bool  # FMCSA would assign a percentile (enough inspections with violations)
    threshold: float  # FMCSA intervention threshold
    over_threshold: bool


class EstimatedIssOut(BaseModel):
    """CarrierSafetyScan's estimate of FMCSA's ISS value (docs/estimated-iss-v1.md)."""

    value: int | None  # 1-100, lower is better; None: not enough data
    band: str | None  # INSPECT (75-100) | OPTIONAL (50-74) | PASS (1-49)
    group: int | None  # FMCSA ISS-CSA group 1-13; 0 = out-of-service order
    reason: str
    basics: list[EstimatedIssBasicOut]
    data_month: date  # FMCSA SMS month the lookup tables were built from
    version: str
    # SAFETY (enough data) | INSUFFICIENT_DATA (FMCSA's little-history rules) | OUT_OF_SERVICE
    # | NONE (no estimate)
    algorithm: str = "SAFETY"


class IssHistoryOut(BaseModel):
    """One saved Estimated ISS: the score as it was when recorded."""

    value: int | None
    band: str | None
    reason: str
    data_month: date
    version: str
    recorded_at: datetime


class PullInRateOut(BaseModel):
    state: str  # 2-letter state code
    percent: int | None  # None: the state gives no rate for this range


class PullInDropOut(BaseModel):
    state: str
    from_percent: int
    to_percent: int


class PullInWhatIfOut(BaseModel):
    """The nearest lower ISS range where some state's pull-in rate falls."""

    below: int  # an Estimated ISS below this value
    drops: list[PullInDropOut]  # biggest drop first


class PullInOut(BaseModel):
    """Each state's weigh-station pull-in rate for the carrier's Estimated ISS (PrePass table)."""

    score: int  # the Estimated ISS the rates were looked up for
    band_min: int
    band_max: int
    beyond_table: bool  # the score is above the table's last range; its strictest rates shown
    # states with a rate on file, highest first; any other state has no rate on file yet
    rates: list[PullInRateOut]
    what_if: PullInWhatIfOut | None
    source: str
    effective_date: date


class CarrierSafetyOut(BaseModel):
    usdot_number: int
    inspection_count: int
    quarters: list[QuarterOut]  # oldest first, from the first inspection to the current quarter
    by_level: list[CountOut]  # by level number
    by_state: list[CountOut]  # most inspections first
    violations: ViolationSummaryOut
    sms: SmsOut | None = None  # None: not fetched yet
    crashes: CrashSummaryOut | None = None  # None: not fetched yet
    drivers: list[BasicDriverOut] | None = None  # None: not fetched yet; heaviest BASIC first
    estimated_iss: EstimatedIssOut | None = None  # None: tables or carrier SMS not loaded yet
    iss_history: list[IssHistoryOut] = []  # saved Estimated ISS results, newest first
    # Weigh-station pull-in rate by state for the Estimated ISS; None: no estimate or no table
    pull_in: PullInOut | None = None


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
