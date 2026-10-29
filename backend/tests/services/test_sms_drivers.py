"""What drives a carrier's CSA measures, from FMCSA's SMS input violations (pure)."""

from datetime import date

from app.services.sms_drivers import basic_drivers, parse_violations


def row(
    basic: str, group: str, weight: str, day: str = "29-AUG-26", oos: str = "false", desc: str = "x"
) -> dict[str, str]:
    return {
        "unique_id": "742856544",
        "insp_date": day,
        "viol_code": "39375C",
        "basic_desc": basic,
        "group_desc": group,
        "section_desc": desc,
        "oos_indicator": oos,
        "severity_weight": weight,
        "time_weight": "1",
        "total_severity_wght": weight,
        "viol_unit": "1",
    }


# Shaped like Sablok Brothers' real rows: tires weigh most in Vehicle Maintenance.
ROWS = [
    row("Vehicle Maintenance", "Tires", "8", desc="Tire-other tread depth less than 2/32 of inch"),
    row("Vehicle Maintenance", "Tires", "8", oos="true", desc="Tire-flat and/or audible air leak"),
    row("Vehicle Maintenance", "Lighting", "2", day="29-AUG-24", desc="Inoperable Required Lamp"),
    row("Hours-of-Service Compliance", "False Log", "7"),
    row("", "ignored without a BASIC", "5"),
]


def test_weights_add_up_by_basic_and_group() -> None:
    violations = parse_violations(ROWS)
    assert len(violations) == 4
    assert violations[0].inspection_date == date(2026, 8, 29)

    maint, hos = basic_drivers(violations, today=date(2026, 10, 9))

    assert (maint.basic, maint.violations, maint.out_of_service, maint.weight) == (
        "Vehicle Maintenance",
        3,
        1,
        18.0,
    )
    assert maint.recent_violations == 2  # the lighting one is from 2024
    tires = maint.groups[0]
    assert (tires.group, tires.violations, tires.weight, tires.share) == ("Tires", 2, 16.0, 0.8889)
    assert tires.examples[0].startswith("Tire-")
    assert (hos.basic, hos.weight) == ("Hours-of-Service Compliance", 7.0)


def timed(inspection: str, basic: str, severity: str, time: str) -> dict[str, str]:
    return {
        **row(basic, "G", severity),
        "unique_id": inspection,
        "time_weight": time,
        "total_severity_wght": severity,
    }


def test_points_are_time_weighted_as_fmcsa_counts_them() -> None:
    """Grewal Freightlines (USDOT 2763257), FMCSA SMS: Unsafe Driving 4×3 + 5×3 = 27 points
    (measure 9 = 27 ÷ 3), Hours of Service 7×3 = 21 points (measure 0.84 = 21 ÷ 25)."""
    rows = parse_violations(
        [
            timed("1", "Unsafe Driving", "4", "3"),
            timed("2", "Unsafe Driving", "5", "3"),
            timed("3", "Hours-of-Service Compliance", "7", "3"),
        ]
    )
    weights = {d.basic: d.weight for d in basic_drivers(rows, date(2026, 10, 1))}
    assert weights == {"Unsafe Driving": 27.0, "Hours-of-Service Compliance": 21.0}


def test_an_inspections_severity_is_capped_at_30_per_basic() -> None:
    """FMCSA SMS: one inspection counts at most 30 severity points in a BASIC (before time)."""
    rows = parse_violations(
        [timed("9", "Vehicle Maintenance", "10", "2") for _ in range(4)]  # 40 -> capped at 30
    )
    [maint] = basic_drivers(rows, date(2026, 10, 1))
    assert maint.weight == 60.0  # 30 x time weight 2
