# CarrierIQ Estimated ISS — v1 methodology

**Status:** v2.1 built 2026-10-14 — safety algorithm (v1), FMCSA's insufficient-data rules (v1.1), the Crash Indicator BASIC (v2) and segment-based Unsafe Driving groups (v2.1). Replaces the earlier "Safety Index" points draft.
**Created:** 2026-10-14
**Shown to:** STS staff (internal Safety tab) and clients (client portal Safety tab).

The Estimated ISS reproduces FMCSA's **Inspection Selection System (ISS)** value — the 1–100
inspection priority roadside inspectors see — from public FMCSA data, following FMCSA's own
published algorithm. It is an **estimate**: FMCSA does not publish ISS values or property
carriers' BASIC percentiles, so CarrierIQ recomputes both.

---

## 1. Scale (same direction as FMCSA's ISS)

| Value | FMCSA recommendation | CarrierIQ wording |
|---|---|---|
| 1–49 | Pass — inspection not warranted | Satisfactory |
| 50–74 | Optional — next-level priority | At risk |
| 75–100 | Inspect — top priority | High risk |

Lower is better. 100 means an active out-of-service order.

---

## 2. Sources

| Document / data | Used for | Where |
|---|---|---|
| FMCSA, *ISS-CSA Algorithm Description*, Dec 2012 (Appendix A) | ISS groups 1–13, ranking inside each band, Pass group, OOS rule, insufficient-data rules | `research_notes/FMCSA ISS and SMS/` · ai.fmcsa.dot.gov/sms/helpfiles/iss_algorithm.pdf |
| FMCSA, *SMS Methodology* v3.21, May 2026 | Peer (safety event) groups, data sufficiency, percentile ranking, intervention thresholds | `research_notes/FMCSA ISS and SMS/` · csa.fmcsa.dot.gov/documents/smsmethodology.pdf |
| FMCSA *SMS AB PassProperty* (data.transportation.gov `4y6x-dmck`), monthly | BASIC measures, inspection counts, inspections with violations, acute/critical flags for every interstate/HM property carrier (~677,000) | public dataset |
| FMCSA *SMS Input - Crash* (`4wxs-vbns`), monthly | every crash SMS uses (24 months, ~252,000), with FMCSA's own severity and time weight; crashes found not preventable carry no weight | public dataset |
| FMCSA *SMS Input - Motor Carrier Census* (`kjg3-diqy`) + Company Census (`az4n-8mr2`) | average power units and recent mileage (utilization factor); fleet by vehicle type (combination / straight segment) | public datasets |
| FMCSA out-of-service orders (`p2mt-9ige`) | ISS 100 override | already ingested by CarrierIQ |

---

## 3. Algorithm

### Step 1 — BASIC percentiles (SMS Methodology v3.21)

For each BASIC, a carrier is ranked only against **peer carriers with a similar amount of data**
(its *safety event group*), among carriers with a non-zero measure. Percentile 0 = best,
100 = worst. A percentile is **assigned** only when the carrier also has the minimum number of
inspections *with violations* in that BASIC.

| BASIC | Ranked when | Peer groups by | Groups | Percentile assigned when |
|---|---|---|---|---|
| Unsafe Driving | ≥ 3 inspections with Unsafe Driving violations | inspections with violations, by segment (v2.1) | combination 3–8 · 9–21 · 22–57 · 58–149 · 150+; straight 3–4 · 5–8 · 9–18 · 19–49 · 50+ | ≥ 3 inspections with violations |
| HOS Compliance | ≥ 3 driver inspections and ≥ 1 with a violation | driver inspections | 3–10 · 11–20 · 21–100 · 101–500 · 501+ | ≥ 3 inspections with violations |
| Driver Fitness | ≥ 5 driver inspections and ≥ 1 with a violation | driver inspections | 5–10 · 11–20 · 21–100 · 101–500 · 501+ | ≥ 5 inspections with violations |
| Controlled Substances/Alcohol | ≥ 1 inspection with a violation | inspections with violations | 1 · 2 · 3 · 4+ | ≥ 1 |
| Vehicle Maintenance | ≥ 5 vehicle inspections and ≥ 1 with a violation | vehicle inspections | 5–10 · 11–20 · 21–100 · 101–500 · 501+ | ≥ 5 inspections with violations |
| Crash Indicator (v2) | ≥ 2 crashes in 24 months | crashes, by segment | combination 2–3 · 4–6 · 7–16 · 17–45 · 46+; straight 2 · 3–4 · 5–8 · 9–26 · 27+ | a crash in the last 12 months |

**Crash Indicator measure** = Σ (severity weight × time weight) ÷ (average power units ×
utilization factor). Severity: tow-away 1, injury or fatality 2, +1 for an HM release. Time:
≤ 6 months 3, ≤ 12 months 2, older 1. The utilization factor raises the denominator for fleets
driving many miles per truck (combination: 1 below 80,000, rising to 1.6 at 160,000–200,000;
straight: 1 below 20,000, up to 3 at 60,000–200,000; 1 above 200,000 or with no mileage).
Combination segment = tractors and motorcoaches ≥ 70% of power units (census fleet, owned +
term- + trip-leased; no fleet on file → combination). The same segment sets the Unsafe Driving
peer groups (v2.1); FMCSA's published Unsafe Driving measure already includes its utilization
factor. Every carrier with two or
more crashes is ranked (~32,000), not only those in the SMS property file.

An FMCSA **acute/critical violation** found in an investigation (the `*_ac` flags) sets that
BASIC's percentile to 100.

### Step 2 — BASICs over FMCSA's intervention threshold (general carriers)

| BASIC | Threshold |
|---|---|
| Unsafe Driving, HOS Compliance, Crash Indicator | 65% |
| Vehicle Maintenance, Driver Fitness, Controlled Substances/Alcohol | 80% |

### Step 3 — FMCSA ISS group (ISS-CSA Appendix A)

| Group | Carriers | Band |
|---|---|---|
| — | Active **out-of-service order** | **100** |
| 1 | **High-risk:** 4+ BASICs over threshold, or 2+ over threshold with Unsafe Driving / HOS / Crash ≥ 85 | Inspect |
| 2–4 | 2–3 BASICs over threshold, with 3 / 2 / 1 of them "best addressed roadside" (all except Unsafe Driving and Crash) | Inspect |
| 5 | HOS Compliance only | Inspect |
| 6 | Insurance / other serious violation only (from investigations — not in public data) | Optional |
| 7 · 8 · 9 · 10 | Vehicle Maintenance · HM · Driver Fitness · Controlled Substances only | Optional |
| 11 | Unsafe Driving and Crash | Optional |
| 12 | Unsafe Driving only, or Crash only | Optional |
| 13 | Enough inspections for at least one measure (≥ 3 driver or ≥ 5 vehicle inspections) but nothing over threshold | Pass |
| — | Fewer inspections than that | Insufficient data (see 3.5) |

### Step 4 — value inside the band

- **Inspect (groups 1–5):** order by group (1 highest), then by the **sum of BASIC
  percentiles**; spread the ordered carriers evenly over **75–99**.
- **Optional (groups 6–12):** same, over **50–74**.
- **Pass (group 13):** re-rank HOS (≥ 3 driver inspections), Driver Fitness (≥ 5), Controlled
  Substances (≥ 3 driver inspections) and Vehicle Maintenance (≥ 5 vehicle inspections) among
  Pass carriers only, by peer group; sum those percentiles; spread over **1–49**.
- Carriers with the **same sum get the same value** (e.g. every clean Pass carrier → 1).

### Step 5 — not enough data (v1.1: ISS-CSA Appendix A insufficient-data algorithm)

Carriers with fewer than 3 driver and 5 vehicle inspections in 24 months:

| Case | Rule | Value |
|---|---|---|
| One inspection short (4 vehicle or 2 driver inspections) | violation rate of those inspections | 70 (0%) … 74 (100%) |
| No inspections, **new interstate carrier** (registered ≤ 18 months) | observed in real ISS2 values, not in the 2012 document | **77** |
| No inspections, otherwise | fleet size: 1 truck 63 · 2–6 64 · 7–15 65 · 16–63 66 · 64–200 67 · 201–1000 68 · 1001+ 69 (drivers likewise; no size 66) | 63–69 |
| Some inspections | inspections per truck and per driver, ranked against ~88,500 such carriers nationally (fewer → higher) | 50–69 |

Inputs: FMCSA census (trucks, drivers, interstate/intrastate, registration date) and the
carrier's own inspections. The monthly job also downloads active carriers' fleet sizes
(~2.24 million) for the national ranking. FMCSA's random 1% at 99 cannot be predicted.

---

## 4. Validation (2026-10-14, FMCSA data of that date — 22 real ISS values)

**Carriers with enough data (safety algorithm): 15 — all 15 in the right band, 12 within ±5
(v2: 11 of those 12 within ±1).**

| USDOT | Carrier | Real | v1.1 | v2 | Diff | Estimated group (v2) |
|---|---|---|---|---|---|---|
| 2465630 | Sablok Brothers Trucking | 95 | 96 | 96 | +1 | 1 high-risk (Crash 15) |
| 3373817 | Jaskirat Truckline | 99 | 97 | 98 | −1 | 1 high-risk (Unsafe 94, HOS 94; Crash 64) |
| 4442941 | Countrywide Cargo | 86 | 87 | 86 | 0 | 5 HOS only (Crash 53) |
| 4488053 | AB Aulakh Transport | 78 | 78 | 78 | 0 | 5 HOS only |
| 3104132 | Love United Transport | 60 | 58 | 61 | +1 | 12 Unsafe only |
| 3157171 | Maridka Transport | 59 | 57 | 59 | 0 | 12 Unsafe only |
| 4227743 | Setia Transportation | 56 | 55 | 56 | 0 | 12 Unsafe only |
| 4157195 | MAJHA Corporation | 55 | 54 | 55 | 0 | 12 Unsafe only |
| 4532702 | Veer Freight | 1 | 1 | 1 | 0 | 13 Pass |
| 4390604 | Labbi Transport | 1 | 1 | 1 | 0 | 13 Pass |
| 3533711 | Saachi Transport | 1 | 1 | 1 | 0 | 13 Pass |
| 2753909 | JJ Macias Trucking (intrastate) | 1 | 1 | 1 | 0 | 13 Pass |
| 3042022 | Hira Transport | 90 | 96 | 98 | +8 | 1 high-risk (Unsafe 76, HOS 99, Crash 88) |
| 3979326 | RANB | 95 | 87 | 86 | −9 | 5 HOS only (Vehicle Maintenance 79.5; Crash 25) |
| 4191215 | 1313 Transport (intrastate) | 29 | 21 | 21 | −8 | 13 Pass — ranking inside Pass |

Adding crashes moved the Optional and lower Inspect carriers to within 0–1 point: carriers
with crash alerts now join those bands, as they do in FMCSA's ranking.

The Crash Indicator did **not** fix the two misses it was expected to fix:

- **Hira** — its Crash Indicator (88th percentile, 17 crashes) is over the threshold, which keeps
  it high-risk; with HOS at 99 it is high-risk under the 2012 rule either way. Group 1 spans
  92–99, so the real 90 means FMCSA did not count Hira as high-risk. FMCSA's current high-risk
  rule (2016 onward) may be stricter than the 2012 one — to check against more carriers.
- **RANB** — two tow-aways on 15 trucks rank only 25th. The miss is Vehicle Maintenance at
  79.5 (exact, under every percentile convention), just under the 80 threshold; at 80 RANB
  would be in group 3 and close to 95. Most likely FMCSA's ISS was computed from a slightly
  different month.

All three misses are pinned as known gaps in the tests.

**Carriers without enough data (insufficient-data algorithm, v1.1): 7 — all 7 within ±5, 6 exact or ±1.**

| USDOT | Carrier | Real | What FMCSA's data shows | Rule that fits |
|---|---|---|---|---|
| 9125866 · 7852189 · 5101228 | Fleeto · Steel Path · JV Global | 77 | interstate, registered 2026, 0 inspections | **not in the 2012 document** — new interstate carriers appear to get 77 (ISS2) |
| 3557017 | Kang Bros Trans (inactive) | 63 | interstate, 2021, 1 truck, 0 inspections | 2012 Case 2: 1 power unit → 63 ✓ |
| 8191530 | Marathon Carrier | 63 | intrastate, Oct 2026, 1 truck, 0 inspections | 2012 Case 2: 1 power unit → 63 ✓ |
| 4571319 | Sekhon Roadways | 70 | 2 driver inspections, both with violations | 2012 Case 1 "one away" → estimate **74**; the real 70 was likely computed before the second inspection |
| 3466371 | Mann Truck Lines | 55 | 1 inspection, 1 truck, 2 drivers | 2012 Case 3 national inspection-rate rank → estimate **56** |

Estimates: the three 77s → 77, Kang and Marathon → 63, Sekhon → 74, Mann → 56.

## 5. Known gaps

1. **Crash Indicator** (v2): average power units and recent mileage come from FMCSA's SMS input
   census, and the segment from the current census fleet. Crashes ruled not preventable are
   excluded because FMCSA gives them no weight. Passenger and HM thresholds (50% / 60%) are not
   applied.
2. **Unsafe Driving segment** (v2.1): taken from the current census fleet, so a carrier whose
   fleet changed recently may be in a different segment from FMCSA's. Of 12,761 straight-truck
   carriers ranked in Unsafe Driving, 712 moved more than 5 points and 626 changed band when
   v2.1 stopped ranking them against tractor fleets. All 22 validated carriers are unchanged
   (every one is a tractor fleet, or in Pass); a straight-truck carrier's real ISS would
   validate it.
3. **HM thresholds** (60% / 75%) and the **HM Compliance BASIC** are not applied.
4. **"Violation in the last 12 months"** rule — the national file has no violation dates.
5. **Group 6** (insurance / other serious violations) needs investigation results, which are
   not public.
6. **ISS2** — FMCSA's current algorithm may differ from the 2012 description (it does for the
   no-data case). The validation set is how we find out.

---

## 6. How it is built

1. **Monthly reference job** (worker schedule): download the national SMS file (~677,000 rows,
   about 2 minutes) and store only **lookup tables**, not the whole file:
   - per BASIC and peer group: the measure at which each percentile starts;
   - per ISS band: how the percentile sums are spread;
   - (v2) the Crash Indicator of every carrier with two or more crashes (crashes, segment,
     measure, recent), because the per-carrier crash weights are not ingested elsewhere.
   Then the active census with fleet by vehicle type (~2.24 million carriers: sizes and
   segments), the SMS Input crash file (~252,000 rows) and, for the ~32,000 carriers with two
   or more crashes, their SMS census (a few hundred carriers per request).
   About 1.2 MB per month instead of ~100–150 MB; the month is stored with them.
2. **Calculator** `app/intelligence/iss_estimate.py`, version `iss-est v2.1`: a carrier's own SMS
   row (already ingested), its segment from its census record + its Crash Indicator from the tables → percentiles, alerts, group,
   value, explanation. Out-of-service order → 100. Tests pin the validated carriers.
3. **API:** the estimate and its explanation in the carrier's Safety data.
4. **Safety tab card** for clients and STS:

```
Estimated ISS (inspection priority)                 54 · Optional
CarrierIQ estimate from public FMCSA data — not FMCSA's official ISS.
1–49 Pass · 50–74 Optional · 75–100 Inspect

Why: Unsafe Driving is over FMCSA's intervention threshold
     (estimated 90th percentile vs the 65% threshold) — one BASIC prioritised → Optional.
What would lower it: fewer Unsafe Driving violations → see How to improve
Based on FMCSA data for October 2026 · How this is estimated →
```

Every estimate is stored with its version (`iss-est v1`) and data month, so a past value can
always be explained.

---

## 7. Wording rules

- Always "**Estimated ISS**" and "CarrierIQ estimate from public FMCSA data — not FMCSA's
  official ISS".
- "Safety score" only together with the name: "Estimated ISS – Safety score" (Safety tab,
  agreed 2026-10-14). Never "rating"; FMCSA's own safety rating (Satisfactory / Conditional /
  Unsatisfactory) stays as it is, beside it.
- Clients see what drives the value and what would lower it, linking to How to improve.

---

## 8. Decisions (agreed 2026-10-14)

1. **Not enough data:** v1 showed "Not enough data"; v1.1 estimates these carriers with FMCSA's
   insufficient-data rules (validated, section 4). "Not enough data" remains only when FMCSA's
   census facts are missing. ✅
2. **Estimated BASIC percentiles:** clients see only over / under FMCSA's threshold (and "not
   enough data"); STS staff also see the estimated percentiles. ✅
3. **Crashes:** a known gap in v1; Crash Indicator added in v2. ✅
4. **Landing page claim** "0 made-up ratings, only FMCSA evidence" — reworded 2026-10-14 to
   "1–100 · Estimated ISS, by FMCSA's published method", and the packet card to "Facts from
   FMCSA, and estimates that follow FMCSA's own published methods". ✅

---

## 9. Next versions

- **v1.1 — insufficient-data carriers:** done 2026-10-14 (section 3, step 5).
- **v2 — Crash Indicator:** done 2026-10-14 (section 3, step 1). Brought the Optional and lower
  Inspect carriers to within ±1; Hira and RANB still miss (section 4).
- **v2.1 — Unsafe Driving segment:** done 2026-10-14 (section 5, gap 2).
- **Next:** more real ISS values (a straight-truck carrier with Unsafe Driving violations too), high-risk and near-threshold carriers especially, to test
  FMCSA's current high-risk rule (Hira) and month-to-month timing (RANB).
