"""Estimated ISS (docs/estimated-iss-v1.md): FMCSA's Inspection Selection System value, rebuilt
from public FMCSA data by following FMCSA's own published algorithm.

Two pure parts:

- `build_reference(rows)` turns FMCSA's national SMS file (every interstate / HM property
  carrier's BASIC measures, data.transportation.gov 4y6x-dmck) into small lookup tables: the
  sorted measures of each BASIC peer group and the spread of percentile sums in each ISS band,
  sampled to at most `SAMPLE` points so a month fits in one database row.
- `estimate(sms, reference, oos_order)` places one carrier in those tables: BASIC percentiles
  (SMS Methodology v3.21), BASICs over FMCSA's intervention thresholds, FMCSA's ISS group 1-13
  and the value inside its band (ISS-CSA Algorithm Description, Appendix A).

Known gaps (methodology section 5): no Crash Indicator, Unsafe Driving assumes the combination
segment, HM thresholds and the 12-month recent-violation rule are not applied.
"""

import bisect
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

VERSION = "iss-est v1"
SAMPLE = 501  # points kept per sorted distribution (0.2-percentile resolution)

HIGH = 10**9
GROUPS_5 = [(5, 10), (11, 20), (21, 100), (101, 500), (501, HIGH)]
GROUPS_3 = [(3, 10), (11, 20), (21, 100), (101, 500), (501, HIGH)]


@dataclass(frozen=True)
class BasicSpec:
    label: str
    exposure: str  # "violations" (inspections with violations), "driver" or "vehicle"
    min_exposure: int  # to be ranked at all
    min_violations: int  # inspections with violations before a percentile is assigned
    groups: Sequence[tuple[int, int]]
    threshold: float  # FMCSA intervention threshold, general carriers
    roadside: bool  # "best addressed roadside" (ISS-CSA Table 1)


# Keys match CarrierIQ's sms_results.basic and FMCSA's SMS file column prefixes.
BASICS: dict[str, BasicSpec] = {
    "unsafe_driv": BasicSpec(
        "Unsafe Driving", "violations", 3, 3,
        [(3, 8), (9, 21), (22, 57), (58, 149), (150, HIGH)], 65, False,
    ),
    "hos_driv": BasicSpec("HOS Compliance", "driver", 3, 3, GROUPS_3, 65, True),
    "driv_fit": BasicSpec("Driver Fitness", "driver", 5, 5, GROUPS_5, 80, True),
    "contr_subst": BasicSpec(
        "Controlled Substances/Alcohol", "violations", 1, 1,
        [(1, 1), (2, 2), (3, 3), (4, HIGH)], 80, True,
    ),
    "veh_maint": BasicSpec("Vehicle Maintenance", "vehicle", 5, 5, GROUPS_5, 80, True),
}  # fmt: skip

# Pass carriers (group 13) are re-ranked on these measures with lower minimums (Appendix A).
PASS_BASICS: dict[str, tuple[str, int, Sequence[tuple[int, int]]]] = {
    "hos_driv": ("driver", 3, GROUPS_3),
    "driv_fit": ("driver", 5, GROUPS_5),
    "contr_subst": ("driver", 3, GROUPS_3),
    "veh_maint": ("vehicle", 5, GROUPS_5),
}

INSPECT, OPTIONAL, PASS = "INSPECT", "OPTIONAL", "PASS"
BANDS = {INSPECT: (75, 99), OPTIONAL: (50, 74), PASS: (1, 49)}


@dataclass(frozen=True)
class SmsBasic:
    measure: float
    inspections_with_violation: int
    acute_critical: bool = False


@dataclass(frozen=True)
class CarrierSms:
    """One carrier's row of FMCSA's monthly SMS results."""

    driver_inspections: int
    vehicle_inspections: int
    basics: Mapping[str, SmsBasic]


@dataclass(frozen=True)
class BasicResult:
    basic: str
    label: str
    percentile: float | None  # None: not enough data for FMCSA to assign one
    threshold: float
    over_threshold: bool


@dataclass(frozen=True)
class IssEstimate:
    value: int | None  # None: not enough data for an estimate
    band: str | None  # INSPECT | OPTIONAL | PASS
    group: int | None  # FMCSA ISS-CSA group 1-13 (0: out-of-service order)
    reason: str
    basics: list[BasicResult] = field(default_factory=list)
    version: str = VERSION


# --- building the reference tables ---------------------------------------------------------------


def _num(value: object) -> float:
    try:
        return float(value or 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def row_to_sms(row: Mapping[str, Any]) -> CarrierSms:
    """A row of FMCSA's SMS file (data.transportation.gov column names) as CarrierSms."""
    return CarrierSms(
        driver_inspections=int(_num(row.get("driver_insp_total"))),
        vehicle_inspections=int(_num(row.get("vehicle_insp_total"))),
        basics={
            key: SmsBasic(
                measure=_num(row.get(f"{key}_measure")),
                inspections_with_violation=int(_num(row.get(f"{key}_insp_w_viol"))),
                acute_critical=str(row.get(f"{key}_ac") or "N").upper() == "Y",
            )
            for key in BASICS
        },
    )


def _group_of(groups: Sequence[tuple[int, int]], n: int) -> int | None:
    for i, (low, high) in enumerate(groups):
        if low <= n <= high:
            return i
    return None


def _exposure(sms: CarrierSms, kind: str, basic: SmsBasic) -> int:
    if kind == "driver":
        return sms.driver_inspections
    if kind == "vehicle":
        return sms.vehicle_inspections
    return basic.inspections_with_violation


def _ranked_group(sms: CarrierSms, key: str) -> int | None:
    """The peer group a carrier is ranked in for this BASIC, or None if it is not ranked."""
    spec, basic = BASICS[key], sms.basics.get(key)
    if basic is None or basic.inspections_with_violation < 1 or basic.measure <= 0:
        return None
    exposure = _exposure(sms, spec.exposure, basic)
    if exposure < spec.min_exposure:
        return None
    return _group_of(spec.groups, exposure)


def _sample(values: list[float]) -> list[float]:
    values.sort()
    n = len(values)
    if n <= SAMPLE:
        return values
    return [values[round(i * (n - 1) / (SAMPLE - 1))] for i in range(SAMPLE)]


def _dist(values: list[float]) -> dict[str, Any]:
    return {"n": len(values), "points": _sample(values)}


def _count_below(dist: Mapping[str, Any], x: float) -> float:
    """How many values of the distribution are strictly below x (exact when not sampled)."""
    points: list[float] = dist["points"]
    n = int(dist["n"])
    if not points:
        return 0.0
    i = bisect.bisect_left(points, x)
    if len(points) == n:
        return float(i)
    return n * i / (len(points) - 1)


def _percentile(dist: Mapping[str, Any] | None, x: float) -> float | None:
    n = int(dist["n"]) if dist else 0
    if dist is None or n < 2:
        return None
    return min(100.0, 100.0 * _count_below(dist, x) / (n - 1))


def build_reference(rows: Iterable[Mapping[str, Any]], data_month: str) -> dict[str, Any]:
    """Lookup tables for `estimate`, from every row of FMCSA's national SMS property file."""
    carriers = [row_to_sms(r) for r in rows]

    pools: dict[str, dict[int, list[float]]] = {k: defaultdict(list) for k in BASICS}
    for sms in carriers:
        for key in BASICS:
            g = _ranked_group(sms, key)
            if g is not None:
                pools[key][g].append(sms.basics[key].measure)
    reference: dict[str, Any] = {
        "version": VERSION,
        "data_month": data_month,
        "carriers": len(carriers),
        "basics": {k: {str(g): _dist(v) for g, v in groups.items()} for k, groups in pools.items()},
    }

    # Every carrier's group and percentile sum, to describe how each band is spread.
    sums: dict[int, list[float]] = defaultdict(list)
    pass_carriers: list[CarrierSms] = []
    for sms in carriers:
        group, results = _classify(sms, reference)
        if group is None:
            continue
        if group == 13:
            pass_carriers.append(sms)
        else:
            sums[group].append(sum(r.percentile or 0 for r in results if r.percentile is not None))
    reference["groups"] = {str(g): _dist(v) for g, v in sums.items()}

    pass_pools: dict[str, dict[int, list[float]]] = {k: defaultdict(list) for k in PASS_BASICS}
    for sms in pass_carriers:
        for key, (kind, minimum, groups) in PASS_BASICS.items():
            exposure = sms.driver_inspections if kind == "driver" else sms.vehicle_inspections
            g = _group_of(groups, exposure) if exposure >= minimum else None
            if g is not None:
                pass_pools[key][g].append(sms.basics[key].measure)
    reference["pass_basics"] = {
        k: {str(g): _dist(v) for g, v in groups.items()} for k, groups in pass_pools.items()
    }
    reference["groups"]["13"] = _dist([_pass_sum(sms, reference) for sms in pass_carriers])
    return reference


# --- estimating one carrier ----------------------------------------------------------------------


def _basic_results(sms: CarrierSms, reference: Mapping[str, Any]) -> list[BasicResult]:
    results = []
    for key, spec in BASICS.items():
        basic = sms.basics.get(key)
        percentile = None
        if basic is not None and basic.inspections_with_violation >= spec.min_violations:
            g = _ranked_group(sms, key)
            if g is not None:
                percentile = _percentile(reference["basics"][key].get(str(g)), basic.measure)
        if basic is not None and basic.acute_critical:
            percentile = 100.0  # FMCSA: a serious violation found in an investigation
        results.append(
            BasicResult(
                key,
                spec.label,
                round(percentile, 1) if percentile is not None else None,
                spec.threshold,
                percentile is not None and percentile >= spec.threshold,
            )
        )
    return results


def _classify(
    sms: CarrierSms, reference: Mapping[str, Any]
) -> tuple[int | None, list[BasicResult]]:
    """FMCSA ISS-CSA group (Appendix A) and the BASIC results it was decided from."""
    results = _basic_results(sms, reference)
    over = [r for r in results if r.over_threshold]
    high_core = any(
        r.basic in ("unsafe_driv", "hos_driv") and (r.percentile or 0) >= 85 for r in over
    )
    roadside = sum(1 for r in over if BASICS[r.basic].roadside)
    if len(over) >= 4 or (len(over) >= 2 and high_core):
        return 1, results
    if len(over) >= 2:
        return {3: 2, 2: 3, 1: 4}.get(min(roadside, 3), 11), results
    if len(over) == 1:
        return {
            "hos_driv": 5,
            "veh_maint": 7,
            "driv_fit": 9,
            "contr_subst": 10,
            "unsafe_driv": 12,
        }[over[0].basic], results
    if sms.driver_inspections >= 3 or sms.vehicle_inspections >= 5:
        return 13, results
    return None, results


def _pass_sum(sms: CarrierSms, reference: Mapping[str, Any]) -> float:
    total = 0.0
    for key, (kind, minimum, groups) in PASS_BASICS.items():
        exposure = sms.driver_inspections if kind == "driver" else sms.vehicle_inspections
        measure = sms.basics[key].measure if key in sms.basics else 0.0
        if exposure < minimum or measure <= 0:
            continue
        g = _group_of(groups, exposure)
        total += _percentile(reference["pass_basics"][key].get(str(g)), measure) or 0.0
    return total


def _band_of(group: int) -> str:
    return INSPECT if group <= 5 else OPTIONAL if group <= 12 else PASS


def _value_in_band(group: int, total: float, reference: Mapping[str, Any]) -> int:
    """Carriers in the band are ordered by group (lower number first), then by percentile sum,
    and spread evenly over the band; ties share the lower value."""
    band = _band_of(group)
    low, high = BANDS[band]
    members = [int(g) for g in reference["groups"] if _band_of(int(g)) == band]
    groups = reference["groups"]
    size = sum(groups[str(g)]["n"] for g in members)
    if size == 0:
        return low
    below = sum(groups[str(g)]["n"] for g in members if g > group)  # later groups rank lower
    below += _count_below(groups[str(group)], total) if str(group) in groups else 0
    return low + int((high - low + 1) * below / size)


REASONS = {
    1: "High-risk: several BASICs over FMCSA's intervention thresholds",
    2: "Three or more BASICs over FMCSA's thresholds",
    3: "Two or more BASICs over FMCSA's thresholds",
    4: "Two or more BASICs over FMCSA's thresholds",
    5: "Hours-of-Service Compliance over FMCSA's threshold",
    7: "Vehicle Maintenance over FMCSA's threshold",
    9: "Driver Fitness over FMCSA's threshold",
    10: "Controlled Substances/Alcohol over FMCSA's threshold",
    11: "Unsafe Driving and another non-roadside BASIC over FMCSA's thresholds",
    12: "Unsafe Driving over FMCSA's threshold",
    13: "Enough inspections, and no BASIC over FMCSA's thresholds",
}


def estimate(
    sms: CarrierSms | None, reference: Mapping[str, Any] | None, oos_order: bool = False
) -> IssEstimate:
    if oos_order:
        return IssEstimate(100, INSPECT, 0, "Active FMCSA out-of-service order")
    if sms is None or reference is None:
        return IssEstimate(None, None, None, "Not enough FMCSA inspection data for an estimate")
    group, results = _classify(sms, reference)
    if group is None:
        return IssEstimate(
            None,
            None,
            None,
            f"Not enough inspections for an estimate ({sms.driver_inspections} driver, "
            f"{sms.vehicle_inspections} vehicle in 24 months; FMCSA needs 3 driver or 5 vehicle)",
            results,
        )
    if group == 13:
        value = _value_in_band(13, _pass_sum(sms, reference), reference)
    else:
        total = sum(r.percentile for r in results if r.percentile is not None)
        value = _value_in_band(group, total, reference)
    return IssEstimate(value, _band_of(group), group, REASONS[group], results)
