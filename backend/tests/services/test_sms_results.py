"""FMCSA SMS results and crash reports (pure)."""

from datetime import date

from app.services.sms_results import NOT_PUBLISHED, crash_summary, sms_result

# Vanek Brothers' real row in SMS AB PassProperty (no percentiles for property carriers).
PROPERTY = {
    "dot_number": "297569",
    "insp_total": "25",
    "driver_insp_total": "25",
    "vehicle_insp_total": "4",
    "unsafe_driv_insp_w_viol": "9",
    "unsafe_driv_measure": "3.15",
    "unsafe_driv_ac": "N",
    "hos_driv_measure": ".17",
    "hos_driv_ac": "N",
    "veh_maint_insp_w_viol": "4",
    "veh_maint_measure": "14.5",
    "veh_maint_ac": "N",
}
PASSENGER = {
    "dot_number": "100115",
    "insp_total": "84",
    "unsafe_driv_measure": ".02",
    "unsafe_driv_pct": "64%",
    "unsafe_driv_rd_alert": "Y",
    "unsafe_driv_basic_alert": "Y",
    "unsafe_driv_ac": "N",
    "veh_maint_pct": "Less than 5 vehicle inspections",
}


def test_property_carrier_has_measures_but_no_percentiles() -> None:
    sms = sms_result(
        [("m3ry-qcip", "SMS AB Pass", []), ("4y6x-dmck", "SMS AB PassProperty", [PROPERTY])]
    )

    assert sms is not None
    assert (sms.dataset, sms.passenger, sms.inspections, sms.vehicle_inspections) == (
        "SMS AB PassProperty",
        False,
        25,
        4,
    )
    unsafe, hos, _, _, maint = sms.basics
    assert (unsafe.label, unsafe.measure, unsafe.inspections_with_violation) == (
        "Unsafe Driving",
        3.15,
        9,
    )
    assert (hos.measure, maint.measure) == (0.17, 14.5)
    assert (unsafe.percentile, unsafe.alert, unsafe.acute_critical) == (None, None, False)
    assert unsafe.note == NOT_PUBLISHED


def test_passenger_carrier_has_fmcsa_percentiles() -> None:
    sms = sms_result([("m3ry-qcip", "SMS AB Pass", [PASSENGER])])

    assert sms is not None and sms.passenger
    unsafe = sms.basics[0]
    assert (unsafe.percentile, unsafe.over_threshold, unsafe.alert) == (64.0, True, True)
    maint = sms.basics[-1]
    assert (maint.percentile, maint.note) == (None, "Less than 5 vehicle inspections")


def test_not_in_sms_and_not_fetched() -> None:
    assert sms_result([]) is None
    missing = sms_result([("4y6x-dmck", "SMS AB PassProperty", [])])
    assert missing is not None and missing.dataset is None


def test_crashes_grouped_by_report_with_recent_window() -> None:
    rows = [
        # Two vehicles in one report count as one crash.
        {"report_number": "IL1", "report_date": "20260124", "fatalities": "0", "tow_away": "Y"},
        {"report_number": "IL1", "report_date": "20260124", "fatalities": "0", "tow_away": "Y"},
        {"report_number": "IL2", "report_date": "20210218", "fatalities": "1", "injuries": "2"},
    ]

    summary = crash_summary(rows, today=date(2026, 10, 9), years=5)

    assert summary is not None
    assert (summary.total, summary.fatal, summary.injury) == (2, 1, 1)
    assert (summary.recent_total, summary.recent_fatal) == (1, 0)  # the fatal one is from 2021
    assert [c.report_number for c in summary.crashes] == ["IL1", "IL2"]
    assert summary.crashes[0].tow_away is True
    assert crash_summary(None, date(2026, 10, 9), 5) is None
