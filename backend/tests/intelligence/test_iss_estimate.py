"""Estimated ISS (docs/estimated-iss-v1.md), pinned to real FMCSA ISS values.

The fixtures are FMCSA's SMS data of October 2026: the lookup tables built from the national
file (~677,000 property carriers) and the SMS rows of carriers whose real ISS is known.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from app.intelligence.iss_estimate import (
    INSPECT,
    OPTIONAL,
    PASS,
    build_reference,
    estimate,
    row_to_sms,
)

FIXTURES = Path(__file__).parents[1] / "fixtures" / "iss"
REFERENCE: dict[str, Any] = json.loads((FIXTURES / "reference_2026_10.json").read_text())
CARRIERS = {
    r["dot_number"]: r for r in json.loads((FIXTURES / "carriers_2026_10.json").read_text())
}


@pytest.mark.parametrize(
    ("usdot", "real_iss", "expected", "band", "group"),
    [
        ("2465630", 95, 96, INSPECT, 1),  # Sablok Brothers: high-risk (Unsafe, HOS 88, Vehicle)
        ("4442941", 86, 87, INSPECT, 5),  # Countrywide Cargo: HOS only
        ("4157195", 55, 54, OPTIONAL, 12),  # MAJHA: Unsafe Driving only
        ("4532702", 1, 1, PASS, 13),  # Veer Freight: enough data, nothing over threshold
        ("3373817", 99, 97, INSPECT, 1),  # Jaskirat Truckline: Unsafe 94, HOS 94
        ("4390604", 1, 1, PASS, 13),  # Labbi Transport
        ("3104132", 60, 58, OPTIONAL, 12),  # Love United Transport: Unsafe only
        ("3157171", 59, 57, OPTIONAL, 12),  # Maridka Transport: Unsafe only
        ("4488053", 78, 78, INSPECT, 5),  # AB Aulakh Transport: HOS only
        ("3533711", 1, 1, PASS, 13),  # Saachi Transport
        ("4227743", 56, 55, OPTIONAL, 12),  # Setia Transportation: Unsafe only
        ("2753909", 1, 1, PASS, 13),  # JJ Macias Trucking (intrastate file)
    ],
)
def test_matches_real_iss_within_five_points(
    usdot: str, real_iss: int, expected: int, band: str, group: int
) -> None:
    result = estimate(row_to_sms(CARRIERS[usdot]), REFERENCE)

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
        # Right band, more than 5 away. Known v1 gap: no Crash Indicator (methodology section 5).
        ("3042022", 90, 96, INSPECT),  # Hira Transport: 17 crashes in 24 months
        ("3979326", 95, 87, INSPECT),  # RANB: 2 crashes on 15 trucks — likely a Crash alert too
        ("4191215", 29, 21, PASS),  # 1313 Transport (intrastate): Pass-band ranking
    ],
)
def test_known_gaps_still_land_in_the_right_band(
    usdot: str, real_iss: int, expected: int, band: str
) -> None:
    result = estimate(row_to_sms(CARRIERS[usdot]), REFERENCE)

    assert (result.value, result.band) == (expected, band)
    # Still a gap; when a fix brings it within 5, move the carrier to the test above.
    assert result.value is not None and abs(result.value - real_iss) > 5
