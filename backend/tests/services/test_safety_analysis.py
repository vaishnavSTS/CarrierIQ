"""Safety calculations on in-memory inspections (no database)."""

from datetime import date
from typing import Any

from app.models import Inspection
from app.services.safety_analysis import counts_by, quarterly_trend, violation_summary


def violation(code: str, part: int, applies_to: str, oos: bool = False) -> dict[str, Any]:
    return {
        "code": code,
        "description": f"desc {code}",
        "part": part,
        "part_title": f"Part {part}",
        "applies_to": applies_to,
        "unit_number": 1 if applies_to == "VEHICLE" else None,
        "out_of_service": oos,
        "category_id": None,
        "citation_number": None,
    }


def inspection(
    day: date,
    *,
    vehicle_oos: bool = False,
    driver_oos: bool = False,
    violations: list[dict[str, Any]] | None = None,
    header_total: int | None = None,
    state: str | None = "WA",
    level: int | None = 3,
) -> Inspection:
    rows = violations or []
    return Inspection(
        inspection_id=str(day.toordinal()),
        inspection_date=day,
        inspection_level=level,
        state=state,
        vehicle_oos=vehicle_oos,
        driver_oos=driver_oos,
        violation_data={
            "viol_total": len(rows) if header_total is None else header_total,
            "violations": rows,
        },
    )


def test_quarters_run_from_the_first_inspection_to_today_with_gaps_filled() -> None:
    inspections = [
        inspection(date(2025, 2, 10), vehicle_oos=True),
        inspection(date(2025, 3, 5)),
        inspection(
            date(2025, 8, 1), driver_oos=True, violations=[violation("392.2", 392, "DRIVER")]
        ),
    ]

    trend = quarterly_trend(inspections, today=date(2026, 1, 15))

    assert [q.quarter for q in trend] == ["2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1"]
    q1, q2, q3, _, now = trend
    assert (q1.inspections, q1.vehicle_oos, q1.vehicle_oos_rate) == (2, 1, 0.5)
    assert (q2.inspections, q2.vehicle_oos_rate) == (0, None)  # empty quarter, no rate
    assert (q3.driver_oos, q3.driver_oos_rate, q3.violations) == (1, 1.0, 1)
    assert (now.inspections, now.start_date) == (0, date(2026, 1, 1))


def test_no_inspections_no_quarters() -> None:
    assert quarterly_trend([], today=date(2026, 1, 1)) == []


def test_counts_by_most_frequent_then_key_with_unknown() -> None:
    assert [(c.key, c.inspections) for c in counts_by(["TX", "WA", "TX", None, "CA"])] == [
        ("TX", 2),
        ("CA", 1),
        ("Unknown", 1),
        ("WA", 1),
    ]


def test_violation_summary() -> None:
    lamp = violation("393.9", 393, "VEHICLE", oos=True)
    inspections = [
        inspection(date(2025, 1, 1), violations=[lamp, violation("392.2", 392, "DRIVER")]),
        inspection(date(2025, 6, 1), violations=[{**lamp, "description": "newer wording"}]),
        inspection(date(2025, 9, 1), header_total=1),  # the header counts one the source lacks
    ]

    summary = violation_summary(inspections)

    assert (summary.total, summary.header_total) == (3, 4)
    assert (summary.driver, summary.vehicle, summary.out_of_service) == (1, 2, 2)
    assert [(p.part, p.violations, p.out_of_service) for p in summary.by_part] == [
        (393, 2, 2),
        (392, 1, 0),
    ]
    top = summary.top_codes[0]
    assert (top.code, top.violations, top.out_of_service, top.last_seen) == (
        "393.9",
        2,
        2,
        date(2025, 6, 1),
    )
    assert top.description == "newer wording"  # the latest description is shown
