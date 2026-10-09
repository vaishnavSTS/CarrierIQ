"""Read FMCSA SMS (CSA) results and crash reports for one carrier. Pure functions.

Every value is FMCSA's own: measures, percentiles (passenger carriers only, as FMCSA publishes
them), alerts and the acute/critical indicator. CarrierIQ computes no score of its own.
"""

import re
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from app.schemas.carrier_safety import BasicOut, CrashOut, CrashSummaryOut, SmsOut

# Public BASICs, in FMCSA's order. Crash Indicator and Hazmat are not in the public files.
BASICS = (
    ("unsafe_driv", "Unsafe Driving"),
    ("hos_driv", "Hours-of-Service Compliance"),
    ("driv_fit", "Driver Fitness"),
    ("contr_subst", "Controlled Substances / Alcohol"),
    ("veh_maint", "Vehicle Maintenance"),
)
NOT_PUBLISHED = "Not published by FMCSA for property carriers"
RECENT_CRASHES = 10
RECENT_MONTHS = 24
_PERCENT = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*%?\s*$")


def _number(value: object) -> float | None:
    try:
        return float(str(value)) if value not in (None, "") else None
    except ValueError:
        return None


def _count(value: object) -> int:
    number = _number(value)
    return int(number) if number is not None else 0


def _flag(value: object) -> bool | None:
    text = str(value or "").strip().upper()
    return {"Y": True, "N": False}.get(text)


def sms_result(
    rows_by_dataset: Sequence[tuple[str, str, list[dict[str, Any]]]],
) -> SmsOut | None:
    """The carrier's SMS row from the first file that has it: (dataset id, name, rows) in
    order of preference. None when no file was fetched; an SmsOut with `dataset` None when the
    carrier is in none of them."""
    if not rows_by_dataset:
        return None
    for dataset_id, name, rows in rows_by_dataset:
        if rows:
            return _from_row(dataset_id, name, rows[0])
    return SmsOut(
        dataset_id=None,
        dataset=None,
        passenger=False,
        inspections=0,
        driver_inspections=0,
        vehicle_inspections=0,
        basics=[],
    )


def _from_row(dataset_id: str, name: str, row: dict[str, Any]) -> SmsOut:
    passenger = any(f"{key}_pct" in row or f"{key}_basic_alert" in row for key, _ in BASICS)
    basics = []
    for key, label in BASICS:
        percentile: float | None = None
        note: str | None = None
        if passenger:
            raw = row.get(f"{key}_pct")
            match = _PERCENT.match(str(raw or ""))
            if match:
                percentile = float(match.group(1))
            elif raw:
                note = str(raw)  # e.g. "Less than 5 vehicle inspections"
        else:
            note = NOT_PUBLISHED
        basics.append(
            BasicOut(
                key=key,
                label=label,
                inspections_with_violation=_count(row.get(f"{key}_insp_w_viol")),
                measure=_number(row.get(f"{key}_measure")),
                percentile=percentile,
                over_threshold=_flag(row.get(f"{key}_rd_alert")),
                alert=_flag(row.get(f"{key}_basic_alert")),
                acute_critical=_flag(row.get(f"{key}_ac")),
                note=note,
            )
        )
    return SmsOut(
        dataset_id=dataset_id,
        dataset=name,
        passenger=passenger,
        inspections=_count(row.get("insp_total")),
        driver_inspections=_count(row.get("driver_insp_total")),
        vehicle_inspections=_count(row.get("vehicle_insp_total")),
        basics=basics,
    )


def _report_date(value: object) -> date | None:
    text = str(value or "")
    if len(text) >= 8 and text[:8].isdigit():
        try:
            return date(int(text[:4]), int(text[4:6]), int(text[6:8]))
        except ValueError:
            return None
    return None


def crash_summary(
    rows: list[dict[str, Any]] | None, today: date, years: int
) -> CrashSummaryOut | None:
    """Crashes FMCSA lists for the carrier; None when not fetched yet. One crash report can list
    several of the carrier's vehicles, so rows are grouped by report."""
    if rows is None:
        return None
    reports: dict[str, CrashOut] = {}
    for row in rows:
        when = _report_date(row.get("report_date"))
        key = str(row.get("report_number") or row.get("crash_id") or "")
        if when is None or not key or key in reports:
            continue
        reports[key] = CrashOut(
            report_number=key,
            report_date=when,
            state=row.get("report_state") or row.get("state"),
            city=row.get("city"),
            fatalities=_count(row.get("fatalities")),
            injuries=_count(row.get("injuries")),
            tow_away=_flag(row.get("tow_away")) is True,
            hazmat_released=_flag(row.get("hazmat_released")) is True,
        )
    crashes = sorted(reports.values(), key=lambda c: c.report_date, reverse=True)
    recent_from = today - timedelta(days=round(RECENT_MONTHS * 365.25 / 12))
    recent = [c for c in crashes if c.report_date >= recent_from]
    return CrashSummaryOut(
        years=years,
        total=len(crashes),
        fatal=sum(1 for c in crashes if c.fatalities),
        injury=sum(1 for c in crashes if c.injuries),
        recent_months=RECENT_MONTHS,
        recent_total=len(recent),
        recent_fatal=sum(1 for c in recent if c.fatalities),
        recent_injury=sum(1 for c in recent if c.injuries),
        crashes=crashes[:RECENT_CRASHES],
    )
