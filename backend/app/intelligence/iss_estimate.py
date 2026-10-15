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

v2 adds the Crash Indicator BASIC (not public in SMS results): rebuilt from FMCSA's SMS Input
crash and census files, which carry each crash's severity and time weight (`crash_basic`).

Both Unsafe Driving and the Crash Indicator rank carriers within their segment (combination or
straight trucks, from the census fleet: `is_straight`).

Known gaps (methodology section 5): HM thresholds and the 12-month recent-violation rule (other
than for crashes) are not applied.
"""

import bisect
from collections import defaultdict
from collections.abc import Container, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

VERSION = "iss-est v2.1"
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
    # Peer groups of the straight-truck segment (Unsafe Driving, Crash); ranked as groups 5-9.
    straight_groups: Sequence[tuple[int, int]] | None = None


# Keys match CarrierIQ's sms_results.basic and FMCSA's SMS file column prefixes.
BASICS: dict[str, BasicSpec] = {
    "unsafe_driv": BasicSpec(
        "Unsafe Driving", "violations", 3, 3,
        [(3, 8), (9, 21), (22, 57), (58, 149), (150, HIGH)], 65, False,
        [(3, 4), (5, 8), (9, 18), (19, 49), (50, HIGH)],
    ),
    "hos_driv": BasicSpec("HOS Compliance", "driver", 3, 3, GROUPS_3, 65, True),
    "driv_fit": BasicSpec("Driver Fitness", "driver", 5, 5, GROUPS_5, 80, True),
    "contr_subst": BasicSpec(
        "Controlled Substances/Alcohol", "violations", 1, 1,
        [(1, 1), (2, 2), (3, 3), (4, HIGH)], 80, True,
    ),
    "veh_maint": BasicSpec("Vehicle Maintenance", "vehicle", 5, 5, GROUPS_5, 80, True),
    # Exposure: crashes in 24 months (two needed). Not in FMCSA's SMS results file.
    "crash": BasicSpec(
        "Crash Indicator", "violations", 2, 2,
        [(2, 3), (4, 6), (7, 16), (17, 45), (46, HIGH)], 65, False,
        [(2, 2), (3, 4), (5, 8), (9, 26), (27, HIGH)],
    ),
}  # fmt: skip
CRASH = "crash"
SMS_FILE_BASICS = [key for key in BASICS if key != CRASH]
STRAIGHT_OFFSET = 5

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
    inspections_with_violation: int  # for the Crash Indicator: crashes
    acute_critical: bool = False
    straight: bool = False  # straight-truck segment (Crash Indicator)
    recent: bool = True  # an event in the last 12 months (FMCSA drops the percentile otherwise)


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
    algorithm: str = "SAFETY"  # SAFETY | INSUFFICIENT_DATA | OUT_OF_SERVICE | NONE


@dataclass(frozen=True)
class CarrierFacts:
    """What the insufficient-data algorithm needs beyond the SMS row (FMCSA census and the
    carrier's own inspections over the last 24 months)."""

    power_units: int | None
    drivers: int | None
    interstate: bool | None  # census carrier_operation A
    registered: date | None  # census add_date
    # Inspections with at least one violation, among vehicle-level (I, II, V, VI) and
    # driver-level (I, II, III, VI) inspections: for carriers "one away" from sufficiency.
    vehicle_inspections_with_violation: int | None = None
    driver_inspections_with_violation: int | None = None


# --- building the reference tables ---------------------------------------------------------------


def _num(value: object) -> float:
    try:
        return float(value or 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def row_to_sms(row: Mapping[str, Any], straight: bool = False) -> CarrierSms:
    """A row of FMCSA's SMS file (data.transportation.gov column names) as CarrierSms;
    `straight`: the carrier's segment, for Unsafe Driving."""
    return CarrierSms(
        driver_inspections=int(_num(row.get("driver_insp_total"))),
        vehicle_inspections=int(_num(row.get("vehicle_insp_total"))),
        basics={
            key: SmsBasic(
                measure=_num(row.get(f"{key}_measure")),
                inspections_with_violation=int(_num(row.get(f"{key}_insp_w_viol"))),
                acute_critical=str(row.get(f"{key}_ac") or "N").upper() == "Y",
                straight=straight and BASICS[key].straight_groups is not None,
            )
            for key in SMS_FILE_BASICS
        },
    )


# --- Crash Indicator (SMS Methodology section 3, Crash Indicator BASIC) -------------------------

COMBINATION_VEHICLES = ("tract", "coach")
ALL_VEHICLES = (
    "truck", "tract", "coach", "school_1_8", "school_9_15", "school_16", "bus_16",
    "van_1_8", "van_9_15", "limo_1_8", "limo_9_15", "limo_16",
)  # fmt: skip
OWNERSHIP = ("own", "trm", "trp")  # owned, term-leased, trip-leased
FLEET_COLUMNS = [f"{o}{v}" for o in OWNERSHIP for v in ALL_VEHICLES]


def is_straight(fleet: Mapping[str, Any]) -> bool:
    """FMCSA's segment from the census fleet: "combination" when tractors and motorcoaches are
    70% or more of the power units, otherwise "straight"."""
    total = sum(_num(fleet.get(c)) for c in FLEET_COLUMNS)
    combination = sum(_num(fleet.get(f"{o}{v}")) for o in OWNERSHIP for v in COMBINATION_VEHICLES)
    return total > 0 and combination / total < 0.7


def utilization_factor(straight: bool, vmt: float, power_units: float) -> float:
    """Tables 3-7 and 3-8: miles per power unit raise the denominator for busy fleets."""
    if vmt <= 0 or power_units <= 0:
        return 1.0
    per_unit = vmt / power_units
    if straight:
        if per_unit < 20_000 or per_unit > 200_000:
            return 1.0
        return per_unit / 20_000 if per_unit < 60_000 else 3.0
    if per_unit < 80_000 or per_unit > 200_000:
        return 1.0
    return 1 + (per_unit - 80_000) / 133_333 if per_unit < 160_000 else 1.6


def crash_basic(
    weights: Sequence[tuple[float, int]], power_units: float, vmt: float, straight: bool
) -> SmsBasic | None:
    """The Crash Indicator from a carrier's crashes as (severity weight, time weight), FMCSA's
    average power units and recent mileage. None below two crashes or without power units."""
    if len(weights) < 2 or power_units <= 0:
        return None
    total = sum(severity * time for severity, time in weights)
    return SmsBasic(
        measure=total / (power_units * utilization_factor(straight, vmt, power_units)),
        inspections_with_violation=len(weights),
        straight=straight,
        recent=any(time >= 2 for _, time in weights),  # time weight 2-3: within 12 months
    )


def with_crash(sms: CarrierSms, reference: Mapping[str, Any], usdot: str) -> CarrierSms:
    """The carrier's SMS data with its Crash Indicator from the reference tables."""
    entry = (reference.get("crash_carriers") or {}).get(usdot)
    if entry is None:
        return sms
    crashes, straight, measure, recent = entry
    crash = SmsBasic(measure, int(crashes), straight=bool(straight), recent=bool(recent))
    return CarrierSms(sms.driver_inspections, sms.vehicle_inspections, {**sms.basics, CRASH: crash})


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
    if basic.straight and spec.straight_groups:
        g = _group_of(spec.straight_groups, exposure)
        return None if g is None else STRAIGHT_OFFSET + g
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


def build_reference(
    rows: Iterable[Mapping[str, Any]],
    data_month: str,
    sizes: Mapping[str, tuple[float, float]] | None = None,
    crashes: Mapping[str, SmsBasic] | None = None,
    straight: Container[str] = (),
) -> dict[str, Any]:
    """Lookup tables for `estimate`, from every row of FMCSA's national SMS property file.
    `sizes` (USDOT -> power units, drivers, from FMCSA's census) adds the inspection-rate
    ranking the insufficient-data algorithm uses for carriers with a few inspections.
    `crashes` (USDOT -> `crash_basic`) adds the Crash Indicator; `straight` holds the USDOT
    numbers of straight-truck carriers (Unsafe Driving peer groups)."""
    rows = list(rows)
    crashes = crashes or {}
    carriers = [row_to_sms(r, str(r.get("dot_number")) in straight) for r in rows]

    pools: dict[str, dict[int, list[float]]] = {k: defaultdict(list) for k in BASICS}
    for sms in carriers:
        for key in SMS_FILE_BASICS:
            g = _ranked_group(sms, key)
            if g is not None:
                pools[key][g].append(sms.basics[key].measure)
    # Every carrier with two or more crashes is ranked, whether or not it is in the SMS file.
    for crash in crashes.values():
        g = _ranked_group(CarrierSms(0, 0, {CRASH: crash}), CRASH)
        if g is not None:
            pools[CRASH][g].append(crash.measure)
    reference: dict[str, Any] = {
        "version": VERSION,
        "data_month": data_month,
        "carriers": len(carriers),
        "basics": {k: {str(g): _dist(v) for g, v in groups.items()} for k, groups in pools.items()},
        "crash_carriers": {
            dot: [c.inspections_with_violation, int(c.straight), round(c.measure, 6), int(c.recent)]
            for dot, c in crashes.items()
        },
    }
    carriers = [
        with_crash(sms, reference, str(row.get("dot_number")))
        for row, sms in zip(rows, carriers, strict=True)
    ]

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

    rates = []
    for row, sms in zip(rows, carriers, strict=True):
        size = (sizes or {}).get(str(row.get("dot_number")))
        if size is None or _insufficient_case(sms) != 3:
            continue
        rate = _inspection_rate(sms, size[0], size[1])
        if rate is not None:
            rates.append(rate)
    reference["inspection_rates"] = _dist(rates)
    return reference


# --- insufficient-data algorithm (ISS-CSA Appendix A, and observed ISS2 values) ------------------

# No inspections: value by fleet size (Appendix A, Case 2): (min power units, min drivers, value)
SIZE_VALUES = [
    (1001, 1001, 69),
    (201, 201, 68),
    (64, 72, 67),
    (16, 16, 66),
    (7, 6, 65),
    (2, 2, 64),
    (1, 1, 63),
]
NO_SIZE_VALUE = 66
# Observed in real ISS values (ISS2, not in the 2012 document): new interstate carriers with no
# inspections get 77. "New" is taken as FMCSA's 18-month new-entrant period.
NEW_INTERSTATE_VALUE = 77
NEW_ENTRANT_DAYS = 548


def _insufficient_case(sms: CarrierSms) -> int | None:
    """1: one inspection short of sufficiency; 2: no inspections; 3: some inspections;
    None: enough data for the safety algorithm."""
    d, v = sms.driver_inspections, sms.vehicle_inspections
    if d >= 3 or v >= 5:
        return None
    if v == 4 or d == 2:
        return 1
    if d == 0 and v == 0:
        return 2
    return 3


def _inspection_rate(sms: CarrierSms, power_units: float, drivers: float) -> float | None:
    rates = []
    if power_units > 0:
        rates.append(sms.vehicle_inspections / power_units)
    if drivers > 0:
        rates.append(sms.driver_inspections / drivers)
    return sum(rates) / len(rates) if rates else None


def _size_value(power_units: int | None, drivers: int | None) -> int:
    values = [
        value
        for min_pu, min_drivers, value in SIZE_VALUES
        if (power_units or 0) >= min_pu or (drivers or 0) >= min_drivers
    ]
    return max(values) if values else NO_SIZE_VALUE


def _insufficient(
    sms: CarrierSms, facts: CarrierFacts, reference: Mapping[str, Any], today: date
) -> tuple[int, str]:
    case = _insufficient_case(sms)
    d, v = sms.driver_inspections, sms.vehicle_inspections
    if case == 1:
        values = []
        if v == 4:
            bad = facts.vehicle_inspections_with_violation
            values.append(70 + (bad if bad is not None else 2))
        if d == 2:
            bad = facts.driver_inspections_with_violation
            values.append(70 + 2 * (bad if bad is not None else 1))
        return (
            min(74, max(values)),
            "One inspection short of the data FMCSA needs; prioritised by its violation rate",
        )
    if case == 2:
        new = bool(
            facts.interstate
            and facts.registered is not None
            and (today - facts.registered) <= timedelta(days=NEW_ENTRANT_DAYS)
        )
        if new:
            return NEW_INTERSTATE_VALUE, "New interstate carrier with no roadside inspections yet"
        return (
            _size_value(facts.power_units, facts.drivers),
            "No roadside inspections in 24 months; prioritised by fleet size",
        )
    rate = _inspection_rate(sms, facts.power_units or 0, facts.drivers or 0)
    dist = reference.get("inspection_rates")
    if rate is None or not dist or not dist["n"]:
        return NO_SIZE_VALUE, "Few roadside inspections in 24 months"
    share_lower = _count_below(dist, rate) / dist["n"]
    return (
        max(50, 69 - int(20 * share_lower)),
        "Few roadside inspections for its size; fewer inspections rank higher",
    )


# --- estimating one carrier ----------------------------------------------------------------------


def _basic_results(sms: CarrierSms, reference: Mapping[str, Any]) -> list[BasicResult]:
    results = []
    for key, spec in BASICS.items():
        basic = sms.basics.get(key)
        percentile = None
        if basic is not None and basic.inspections_with_violation >= spec.min_violations:
            g = _ranked_group(sms, key)
            if g is not None and basic.recent:
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
        r.basic in ("unsafe_driv", "hos_driv", CRASH) and (r.percentile or 0) >= 85 for r in over
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
            CRASH: 12,
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
    1: "Several safety categories well over FMCSA's thresholds (FMCSA's high-risk rule)",
    2: "Three or more safety categories over FMCSA's thresholds",
    3: "Two or more safety categories over FMCSA's thresholds",
    4: "Two or more safety categories over FMCSA's thresholds",
    5: "Hours-of-Service Compliance over FMCSA's threshold",
    7: "Vehicle Maintenance over FMCSA's threshold",
    9: "Driver Fitness over FMCSA's threshold",
    10: "Controlled Substances/Alcohol over FMCSA's threshold",
    11: "Unsafe Driving and Crash Indicator over FMCSA's thresholds",
    12: "{} over FMCSA's threshold",  # Unsafe Driving or Crash Indicator
    13: "No safety category over FMCSA's thresholds",
}


def estimate(
    sms: CarrierSms | None,
    reference: Mapping[str, Any] | None,
    oos_order: bool = False,
    facts: CarrierFacts | None = None,
    today: date | None = None,
) -> IssEstimate:
    if oos_order:
        return IssEstimate(
            100, INSPECT, 0, "Active FMCSA out-of-service order", algorithm="OUT_OF_SERVICE"
        )
    if reference is None or (sms is None and facts is None):
        return IssEstimate(
            None, None, None, "Not enough FMCSA inspection data for an estimate", algorithm="NONE"
        )
    if sms is None:  # not in FMCSA's SMS file: no inspections in the 24-month period
        sms = CarrierSms(driver_inspections=0, vehicle_inspections=0, basics={})
    group, results = _classify(sms, reference)
    if group is None and facts is not None:
        value, reason = _insufficient(sms, facts, reference, today or date.today())
        band = INSPECT if value >= 75 else OPTIONAL
        return IssEstimate(value, band, None, reason, results, algorithm="INSUFFICIENT_DATA")
    if group is None:
        return IssEstimate(
            None,
            None,
            None,
            f"Not enough inspections for an estimate ({sms.driver_inspections} driver, "
            f"{sms.vehicle_inspections} vehicle in 24 months; FMCSA needs 3 driver or 5 vehicle)",
            results,
            algorithm="NONE",
        )
    if group == 13:
        value = _value_in_band(13, _pass_sum(sms, reference), reference)
    else:
        total = sum(r.percentile for r in results if r.percentile is not None)
        value = _value_in_band(group, total, reference)
    reason = REASONS[group]
    if group == 12:
        reason = reason.format(next(r.label for r in results if r.over_threshold))
    return IssEstimate(value, _band_of(group), group, reason, results)
