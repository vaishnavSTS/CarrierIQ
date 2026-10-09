"""Safety figures computed from a carrier's inspections. Pure functions, no database access."""

from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.core.inspection_levels import examines_driver, examines_vehicle
from app.models import Inspection
from app.schemas.carrier_safety import (
    CountOut,
    QuarterOut,
    ViolationCodeOut,
    ViolationOut,
    ViolationPartOut,
    ViolationSummaryOut,
)

TOP_CODES = 10


def violations_of(inspection: Inspection) -> list[dict[str, Any]]:
    data = inspection.violation_data or {}
    violations: list[dict[str, Any]] = data.get("violations", [])
    return violations


@dataclass
class _Totals:
    inspections: int = 0
    vehicle_inspections: int = 0
    driver_inspections: int = 0
    vehicle_oos: int = 0
    driver_oos: int = 0
    violations: int = 0


def quarter_of(day: date) -> tuple[int, int]:
    return day.year, (day.month - 1) // 3 + 1


def quarterly_trend(inspections: Sequence[Inspection], today: date) -> list[QuarterOut]:
    """One entry per quarter from the first inspection's quarter to today's, empty quarters
    included, so a gap in inspections is visible rather than skipped."""
    if not inspections:
        return []

    totals: dict[tuple[int, int], _Totals] = {}
    for inspection in inspections:
        quarter = totals.setdefault(quarter_of(inspection.inspection_date), _Totals())
        quarter.inspections += 1
        vehicle = examines_vehicle(inspection.inspection_level)
        driver = examines_driver(inspection.inspection_level)
        quarter.vehicle_inspections += vehicle
        quarter.driver_inspections += driver
        quarter.vehicle_oos += vehicle and inspection.vehicle_oos
        quarter.driver_oos += driver and inspection.driver_oos
        quarter.violations += len(violations_of(inspection))

    year, q = min(totals)
    end = max(quarter_of(today), max(totals))
    trend = []
    while (year, q) <= end:
        t = totals.get((year, q), _Totals())
        trend.append(
            QuarterOut(
                quarter=f"{year}-Q{q}",
                start_date=date(year, 3 * q - 2, 1),
                inspections=t.inspections,
                vehicle_inspections=t.vehicle_inspections,
                driver_inspections=t.driver_inspections,
                vehicle_oos=t.vehicle_oos,
                driver_oos=t.driver_oos,
                vehicle_oos_rate=rate(t.vehicle_oos, t.vehicle_inspections),
                driver_oos_rate=rate(t.driver_oos, t.driver_inspections),
                violations=t.violations,
            )
        )
        year, q = (year + 1, 1) if q == 4 else (year, q + 1)
    return trend


def counts_by(keys: Iterable[str | None]) -> list[CountOut]:
    """Most frequent first; ties by key. Missing keys are counted as "Unknown"."""
    counter = Counter(key or "Unknown" for key in keys)
    return [
        CountOut(key=key, inspections=n)
        for key, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def violation_summary(inspections: Sequence[Inspection]) -> ViolationSummaryOut:
    rows = [(i.inspection_date, v) for i in inspections for v in violations_of(i)]

    parts: dict[int | None, list[int]] = {}
    titles: dict[int | None, str | None] = {}
    codes: dict[str | None, dict[str, Any]] = {}
    for seen, v in rows:
        part = parts.setdefault(v.get("part"), [0, 0])
        part[0] += 1
        part[1] += bool(v.get("out_of_service"))
        titles[v.get("part")] = v.get("part_title")

        code = codes.setdefault(
            v.get("code"),
            {
                "description": v.get("description"),
                "part": v.get("part"),
                "n": 0,
                "oos": 0,
                "last": seen,
            },
        )
        code["n"] += 1
        code["oos"] += bool(v.get("out_of_service"))
        if seen > code["last"]:
            code["last"] = seen
            code["description"] = v.get("description")  # the latest wording

    by_part = sorted(
        parts.items(), key=lambda kv: (-kv[1][0], kv[0] if kv[0] is not None else 10**6)
    )
    top = sorted(codes.items(), key=lambda kv: (-kv[1]["n"], -kv[1]["oos"], kv[0] or ""))
    return ViolationSummaryOut(
        total=len(rows),
        header_total=sum((i.violation_data or {}).get("viol_total", 0) for i in inspections),
        driver=sum(v.get("applies_to") == "DRIVER" for _, v in rows),
        vehicle=sum(v.get("applies_to") == "VEHICLE" for _, v in rows),
        out_of_service=sum(bool(v.get("out_of_service")) for _, v in rows),
        by_part=[
            ViolationPartOut(part=p, title=titles[p], violations=n, out_of_service=oos)
            for p, (n, oos) in by_part
        ],
        top_codes=[
            ViolationCodeOut(
                code=c,
                description=d["description"],
                part=d["part"],
                violations=d["n"],
                out_of_service=d["oos"],
                last_seen=d["last"],
            )
            for c, d in top[:TOP_CODES]
        ],
    )


def violation_details(inspection: Inspection) -> list[ViolationOut]:
    return [
        ViolationOut(
            code=v.get("code"),
            description=v.get("description"),
            part=v.get("part"),
            part_title=v.get("part_title"),
            applies_to=v.get("applies_to"),
            unit_number=v.get("unit_number"),
            out_of_service=bool(v.get("out_of_service")),
            citation_number=v.get("citation_number"),
        )
        for v in violations_of(inspection)
    ]


def rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None
