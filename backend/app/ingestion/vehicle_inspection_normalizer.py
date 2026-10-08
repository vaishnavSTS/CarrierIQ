"""Vehicle Inspection header + units -> canonical inspection values (spec Section 19.3).

Pure functions, no database access.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.core.exceptions import SourceDataError

Row = dict[str, Any]

# Per-inspection totals kept in inspections.violation_data. Individual violations come from a
# separate dataset (Vehicle Inspections and Violations) in Phase 5.
VIOLATION_COUNTS = (
    "viol_total",
    "oos_total",
    "driver_viol_total",
    "driver_oos_total",
    "vehicle_viol_total",
    "vehicle_oos_total",
    "hazmat_viol_total",
    "hazmat_oos_total",
)

# 49 CFR part titles, used to group violations. Parts 100-180 are the hazardous materials
# regulations. Parts not listed here are shown by number only.
CFR_PART_TITLES = {
    382: "Controlled substances and alcohol use and testing",
    383: "Commercial driver's license standards",
    385: "Safety fitness procedures",
    387: "Minimum levels of financial responsibility",
    390: "General",
    391: "Qualifications of drivers",
    392: "Driving of commercial motor vehicles",
    393: "Parts and accessories necessary for safe operation",
    395: "Hours of service of drivers",
    396: "Inspection, repair, and maintenance",
    397: "Transportation of hazardous materials; driving and parking rules",
}

# 17 characters; VINs never use I, O or Q.
VIN_PATTERN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


@dataclass(frozen=True)
class InspectionValues:
    inspection_id: str
    inspection_date: date
    inspection_level: int | None
    state: str | None
    location: str | None
    # The VIN of unit 1, the primary (power) unit. All units, trailers included, stay in
    # raw_records for VIN relationships (Phase 7).
    vin: str | None
    vehicle_oos: bool
    driver_oos: bool
    # The header's VIOLATION_COUNTS, plus "violations": one entry per violation row (see
    # _violation), in the source's sequence order.
    violation_data: dict[str, Any]


def normalize_inspection(
    header: Row, units: Sequence[Row], violations: Sequence[Row] = ()
) -> InspectionValues:
    inspection_id = _text(header, "inspection_id")
    if inspection_id is None:
        raise SourceDataError("Inspection row has no inspection_id")
    inspection_date = _date(header, "insp_date")
    if inspection_date is None:
        raise SourceDataError(f"Inspection {inspection_id} has no valid insp_date")

    counts: dict[str, Any] = {field: _int(header, field) or 0 for field in VIOLATION_COUNTS}
    own = [v for v in violations if v.get("inspection_id") == inspection_id]
    own.sort(key=lambda v: (_int(v, "seq_no") or 0, v.get("insp_violation_id", "")))
    return InspectionValues(
        inspection_id=inspection_id,
        inspection_date=inspection_date,
        inspection_level=_int(header, "insp_level_id"),
        state=_text(header, "report_state"),
        location=_text(header, "location_desc"),
        vin=_primary_vin(inspection_id, units),
        vehicle_oos=counts["vehicle_oos_total"] > 0,
        driver_oos=counts["driver_oos_total"] > 0,
        violation_data={**counts, "violations": [_violation(v) for v in own]},
    )


def cfr_part_title(part: int | None) -> str | None:
    if part is None:
        return None
    if 100 <= part <= 180:
        return "Hazardous materials regulations"
    return CFR_PART_TITLES.get(part)


def _violation(row: Row) -> dict[str, Any]:
    """One violation, kept JSON-serializable for inspections.violation_data."""
    unit = _text(row, "insp_viol_unit")
    part = _int(row, "part_no")
    return {
        "code": _text(row, "viol_code"),
        "description": _text(row, "viol_desc"),
        "part": part,
        "part_title": cfr_part_title(part),
        # "D" marks the driver; a number is the vehicle unit (1 = power unit, 2+ = trailers).
        "applies_to": "DRIVER" if unit == "D" else "VEHICLE" if unit else None,
        "unit_number": _int(row, "insp_viol_unit"),
        "out_of_service": _text(row, "out_of_service_indicator") == "Y",
        "category_id": _int(row, "insp_violation_category_id"),
        "citation_number": _text(row, "citation_number"),
    }


def normalize_vin(value: str | None) -> str | None:
    """Upper-case VIN with spaces/dashes removed, or None if it is not a valid 17-character VIN."""
    if value is None:
        return None
    vin = re.sub(r"[\s-]", "", value).upper()
    return vin if VIN_PATTERN.match(vin) else None


def _primary_vin(inspection_id: str, units: Sequence[Row]) -> str | None:
    own = [u for u in units if u.get("inspection_id") == inspection_id]
    primary = next((u for u in own if _int(u, "insp_unit_number") == 1), None)
    return normalize_vin(_text(primary, "insp_unit_vehicle_id_number")) if primary else None


def _text(row: Row, field: str) -> str | None:
    value = row.get(field)
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _int(row: Row, field: str) -> int | None:
    value = _text(row, field)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _date(row: Row, field: str) -> date | None:
    value = _text(row, field)
    if value is None or len(value) != 8 or not value.isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError:
        return None
