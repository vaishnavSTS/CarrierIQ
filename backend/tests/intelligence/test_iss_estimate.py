"""Estimated ISS (docs/estimated-iss-v1.md), pinned to real FMCSA ISS values.

The fixtures are FMCSA's SMS data of October 2026: the lookup tables built from the national
file (~677,000 property carriers) and the SMS Input crash file (~32,000 carriers with two or
more crashes; the fixture keeps only the crash entries of the carriers below), and the SMS rows
of carriers whose real ISS is known.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app.intelligence.iss_estimate import (
    INSPECT,
    OPTIONAL,
    PASS,
    CarrierFacts,
    CarrierSms,
    build_reference,
    crash_basic,
    estimate,
    is_straight,
    row_to_sms,
    utilization_factor,
    with_crash,
)

FIXTURES = Path(__file__).parents[1] / "fixtures" / "iss"
REFERENCE: dict[str, Any] = json.loads((FIXTURES / "reference_2026_10.json").read_text())
CARRIERS = {
    r["dot_number"]: r for r in json.loads((FIXTURES / "carriers_2026_10.json").read_text())
}


def sms_of(usdot: str) -> CarrierSms:
    """The carrier's SMS row with its Crash Indicator, as the service builds it."""
    return with_crash(row_to_sms(CARRIERS[usdot]), REFERENCE, usdot)


@pytest.mark.parametrize(
    ("usdot", "real_iss", "expected", "band", "group"),
    [
        ("2465630", 95, 96, INSPECT, 1),  # Sablok Brothers: high-risk (Unsafe, HOS 88, Vehicle)
        ("4442941", 86, 86, INSPECT, 5),  # Countrywide Cargo: HOS only (Crash 53)
        ("4157195", 55, 55, OPTIONAL, 12),  # MAJHA: Unsafe Driving only
        ("4532702", 1, 1, PASS, 13),  # Veer Freight: enough data, nothing over threshold
        ("3373817", 99, 98, INSPECT, 1),  # Jaskirat Truckline: Unsafe 94, HOS 94 (Crash 64)
        ("4390604", 1, 1, PASS, 13),  # Labbi Transport
        ("3104132", 60, 61, OPTIONAL, 12),  # Love United Transport: Unsafe only
        ("3157171", 59, 59, OPTIONAL, 12),  # Maridka Transport: Unsafe only
        ("4488053", 78, 78, INSPECT, 5),  # AB Aulakh Transport: HOS only
        ("3533711", 1, 1, PASS, 13),  # Saachi Transport
        ("4227743", 56, 56, OPTIONAL, 12),  # Setia Transportation: Unsafe only
        ("2753909", 1, 1, PASS, 13),  # JJ Macias Trucking (intrastate file)
    ],
)
def test_matches_real_iss_within_five_points(
    usdot: str, real_iss: int, expected: int, band: str, group: int
) -> None:
    result = estimate(sms_of(usdot), REFERENCE)

    assert (result.value, result.band, result.group) == (expected, band, group)
    assert result.value is not None and abs(result.value - real_iss) <= 5


def test_reasons_name_the_basics_over_threshold() -> None:
    result = estimate(row_to_sms(CARRIERS["4157195"]), REFERENCE)

    over = [(b.label, b.percentile) for b in result.basics if b.over_threshold]
    assert over == [("Unsafe Driving", pytest.approx(90, abs=1))]
    assert result.reason == "Unsafe Driving over FMCSA's threshold"
    # HOS and Driver Fitness have only 2 inspections with violations: FMCSA assigns no percentile.
    by_basic = {b.basic: b.percentile for b in result.basics}
    assert by_basic["hos_driv"] is None and by_basic["driv_fit"] is None


def test_no_inspections_is_not_enough_data() -> None:
    result = estimate(row_to_sms(CARRIERS["9125866"]), REFERENCE)  # real ISS 77 (ISS2 rule)

    assert (result.value, result.band, result.group) == (None, None, None)
    assert result.reason.startswith("Not enough inspections")


def test_out_of_service_order_is_100() -> None:
    result = estimate(row_to_sms(CARRIERS["4532702"]), REFERENCE, oos_order=True)

    assert (result.value, result.band, result.group) == (100, INSPECT, 0)


def test_acute_critical_violation_sets_the_basic_to_100() -> None:
    row = {**CARRIERS["4532702"], "driv_fit_ac": "Y"}

    result = estimate(row_to_sms(row), REFERENCE)

    fitness = next(b for b in result.basics if b.basic == "driv_fit")
    assert (fitness.percentile, fitness.over_threshold) == (100.0, True)
    assert (result.band, result.group) == (OPTIONAL, 9)  # Driver Fitness only


def _row(dot: int, driver: int, vehicle: int, hos: float, hos_viol: int) -> dict[str, Any]:
    return {
        "dot_number": str(dot),
        "driver_insp_total": str(driver),
        "vehicle_insp_total": str(vehicle),
        "hos_driv_measure": str(hos),
        "hos_driv_insp_w_viol": str(hos_viol),
    }


def test_build_reference_ranks_within_peer_groups_and_bands() -> None:
    # 10 carriers with 5 driver inspections each and increasing HOS measures (one peer group).
    rows = [_row(i, 5, 0, float(i), 3) for i in range(1, 11)]
    reference = build_reference(rows, "2026-10")

    assert reference["basics"]["hos_driv"]["0"]["n"] == 10
    worst = estimate(row_to_sms(rows[-1]), reference)
    best = estimate(row_to_sms(rows[0]), reference)
    assert (worst.band, worst.group) == (INSPECT, 5)  # 100th percentile in HOS
    assert best.band == PASS and best.value == 1  # nothing over threshold, lowest in Pass
    assert worst.basics[1].percentile == 100.0 and best.basics[1].percentile == 0.0


@pytest.mark.parametrize(
    ("usdot", "real_iss", "expected", "band"),
    [
        # Right band, more than 5 away (methodology section 5).
        # Hira: Crash 88 makes it high-risk (group 1, 92-99); the real 90 sits in group 2-3.
        ("3042022", 90, 98, INSPECT),
        # RANB: Vehicle Maintenance 79.5, just under 80; at 80 it would be group 3 (~88-91+).
        ("3979326", 95, 86, INSPECT),
        ("4191215", 29, 21, PASS),  # 1313 Transport (intrastate): Pass-band ranking
    ],
)
def test_known_gaps_still_land_in_the_right_band(
    usdot: str, real_iss: int, expected: int, band: str
) -> None:
    result = estimate(sms_of(usdot), REFERENCE)

    assert (result.value, result.band) == (expected, band)
    # Still a gap; when a fix brings it within 5, move the carrier to the test above.
    assert result.value is not None and abs(result.value - real_iss) > 5


# --- v1.1: carriers without enough data (FMCSA's insufficient-data algorithm) -------------------

TODAY = date(2026, 10, 14)


def facts(
    pu: int, drivers: int, interstate: bool, registered: date, veh_bad: int = 0, drv_bad: int = 0
) -> CarrierFacts:
    return CarrierFacts(pu, drivers, interstate, registered, veh_bad, drv_bad)


@pytest.mark.parametrize(
    ("usdot", "real_iss", "carrier_facts", "expected"),
    [
        # New interstate carriers, no inspections (observed ISS2 rule): 77
        ("9125866", 77, facts(1, 1, True, date(2026, 7, 2)), 77),  # Fleeto Trans
        ("7852189", 77, facts(2, 1, True, date(2026, 9, 8)), 77),  # Steel Path Transport
        ("5101228", 77, facts(1, 1, True, date(2026, 7, 3)), 77),  # JV Global Logistics
        # A few inspections: ranked nationally by inspections per truck / driver
        ("3466371", 55, facts(1, 2, True, date(2020, 8, 7)), 56),  # Mann Truck Lines
        # One driver inspection short: 70 + 2 per inspection with a violation (2 of 2 here;
        # the real 70 was likely computed before its second inspection was counted)
        ("4571319", 70, facts(1, 1, True, date(2026, 4, 23), 1, 2), 74),  # Sekhon Roadways
    ],
)
def test_insufficient_data_carriers(
    usdot: str, real_iss: int, carrier_facts: CarrierFacts, expected: int
) -> None:
    result = estimate(row_to_sms(CARRIERS[usdot]), REFERENCE, False, carrier_facts, TODAY)

    assert (result.value, result.algorithm) == (expected, "INSUFFICIENT_DATA")
    assert result.value is not None and abs(result.value - real_iss) <= 5


@pytest.mark.parametrize(
    ("carrier_facts", "expected"),
    [
        (facts(1, 1, True, date(2021, 1, 25)), 63),  # Kang Bros: interstate but not new
        (facts(1, 1, False, date(2026, 10, 7)), 63),  # Marathon Carrier: new but intrastate
        (facts(75, 50, True, date(2010, 1, 1)), 67),  # FMCSA example: 75 trucks, 50 drivers
        (facts(0, 0, False, date(2010, 1, 1)), 66),  # no size information: midpoint
    ],
)
def test_no_inspections_by_fleet_size(carrier_facts: CarrierFacts, expected: int) -> None:
    result = estimate(None, REFERENCE, False, carrier_facts, TODAY)  # not in FMCSA's SMS file

    assert (result.value, result.band) == (expected, OPTIONAL)


def test_one_vehicle_inspection_short_ranks_by_violation_rate() -> None:
    row = {"dot_number": "1", "driver_insp_total": "1", "vehicle_insp_total": "4"}

    clean = estimate(row_to_sms(row), REFERENCE, False, facts(1, 1, True, TODAY, 0, 0), TODAY)
    all_bad = estimate(row_to_sms(row), REFERENCE, False, facts(1, 1, True, TODAY, 4, 1), TODAY)

    assert (clean.value, all_bad.value) == (70, 74)


# --- v2: Crash Indicator (SMS Methodology, Crash Indicator BASIC) -------------------------------


def test_hira_crash_indicator_is_over_threshold_and_high_risk() -> None:
    result = estimate(sms_of("3042022"), REFERENCE)  # 17 crashes, 59 trucks, 8.8M miles

    crash = next(b for b in result.basics if b.basic == "crash")
    assert crash.over_threshold and crash.percentile == pytest.approx(88, abs=1)
    assert result.group == 1


def test_two_crashes_on_a_small_fleet_stay_under_threshold() -> None:
    result = estimate(sms_of("3979326"), REFERENCE)  # RANB: 2 tow-aways, 15 trucks

    crash = next(b for b in result.basics if b.basic == "crash")
    assert crash.percentile is not None and not crash.over_threshold


@pytest.mark.parametrize(
    ("straight", "vmt", "power_units", "factor"),
    [
        (False, 8_822_320, 59, pytest.approx(1.521, abs=0.001)),  # 149,531 mi per truck
        (False, 1_800_000, 10, 1.6),
        (False, 2_500_000, 10, 1.0),  # over 200,000 per truck
        (False, 0, 10, 1.0),  # no recent mileage
        (True, 400_000, 10, 2.0),
        (True, 1_000_000, 10, 3.0),
    ],
)
def test_utilization_factor(straight: bool, vmt: float, power_units: float, factor: Any) -> None:
    assert utilization_factor(straight, vmt, power_units) == factor


def test_crash_measure_and_recency() -> None:
    # Two tow-aways a year+ ago (1 x 1) and an injury crash this half-year (2 x 3), 10 trucks.
    basic = crash_basic([(1, 1), (1, 1), (2, 3)], 10, 0, straight=False)

    assert basic is not None
    assert (basic.measure, basic.inspections_with_violation, basic.recent) == (0.8, 3, True)
    assert crash_basic([(2, 3)], 10, 0, straight=False) is None  # one crash: not ranked
    old = crash_basic([(1, 1), (1, 1)], 10, 0, straight=False)
    assert old is not None and not old.recent  # none in 12 months: FMCSA drops the percentile


def test_old_crashes_get_no_percentile() -> None:
    reference = {**REFERENCE, "crash_carriers": {"3042022": [17, 0, 0.356477, 0]}}

    result = estimate(with_crash(row_to_sms(CARRIERS["3042022"]), reference, "3042022"), reference)

    assert next(b for b in result.basics if b.basic == "crash").percentile is None


def test_segment_from_census_fleet() -> None:
    assert not is_straight({"owntract": "59", "owntrail": "100"})  # trailers don't count
    assert is_straight({"owntract": "6", "trmtruck": "4"})  # 60% tractors
    assert not is_straight({"owntract": "7", "owntruck": "3"})  # 70%: combination
    assert not is_straight({})  # no fleet on file: combination


def test_crash_only_alert_is_group_12() -> None:
    reference = {**REFERENCE, "crash_carriers": {"4532702": [17, 0, 5.0, 1]}}

    result = estimate(with_crash(row_to_sms(CARRIERS["4532702"]), reference, "4532702"), reference)

    assert (result.band, result.group) == (OPTIONAL, 12)
    assert result.reason == "Crash Indicator over FMCSA's threshold"


# --- v2.1: Unsafe Driving segment ----------------------------------------------------------------


def test_straight_truck_carriers_rank_in_straight_unsafe_driving_groups() -> None:
    row = {**CARRIERS["4157195"]}  # MAJHA: Unsafe Driving over threshold as a tractor fleet

    combination = estimate(row_to_sms(row), REFERENCE)
    straight = estimate(row_to_sms(row, straight=True), REFERENCE)

    def unsafe(e: Any) -> float:
        return next(b.percentile for b in e.basics if b.basic == "unsafe_driv")

    assert row_to_sms(row, straight=True).basics["unsafe_driv"].straight
    assert not row_to_sms(row, straight=True).basics["hos_driv"].straight  # no segments
    assert unsafe(straight) != unsafe(combination)  # ranked against other straight-truck fleets
