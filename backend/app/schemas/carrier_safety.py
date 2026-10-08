"""Safety detail and inspection history (spec Phase 5: inspection history, OOS, counts, trends)."""

from datetime import date

from pydantic import BaseModel


class QuarterOut(BaseModel):
    quarter: str  # e.g. "2025-Q3"
    start_date: date
    inspections: int
    vehicle_oos: int
    driver_oos: int
    # Share of the quarter's inspections with an OOS order, 0..1; None without inspections.
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


class CarrierSafetyOut(BaseModel):
    usdot_number: int
    inspection_count: int
    quarters: list[QuarterOut]  # oldest first, from the first inspection to the current quarter
    by_level: list[CountOut]  # by level number
    by_state: list[CountOut]  # most inspections first
    violations: ViolationSummaryOut


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
