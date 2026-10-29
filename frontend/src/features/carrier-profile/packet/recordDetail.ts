import type {
  BasicDriver,
  CarrierSafety,
  Sms,
  SmsInspection,
  SmsViolation,
} from '../../../types/carrierSafety'
import { basicKey } from './basicTiles'

/**
 * FMCSA's safety event groups for property carriers (SMS methodology): which peer group a BASIC
 * is compared in, by how many relevant inspections (or inspections with violations) it has.
 * Below the first group FMCSA assigns no percentile.
 */
const EVENT_GROUPS: Record<
  string,
  { by: 'driver' | 'vehicle' | 'with'; noun: string; edges: number[] }
> = {
  unsafe_driv: {
    by: 'with',
    noun: 'driver inspections with Unsafe Driving violations',
    edges: [3, 9, 22, 58, 150],
  },
  hos_driv: { by: 'driver', noun: 'relevant driver inspections', edges: [3, 11, 21, 101, 501] },
  driv_fit: { by: 'driver', noun: 'relevant driver inspections', edges: [5, 11, 21, 101, 501] },
  veh_maint: { by: 'vehicle', noun: 'relevant vehicle inspections', edges: [5, 11, 21, 101, 501] },
  contr_subst: {
    by: 'with',
    noun: 'driver inspections with drug/alcohol violations',
    edges: [1, 2, 3, 4],
  },
}

function eventGroup(key: string, sms: Sms, withViolation: number): string | null {
  const rule = EVENT_GROUPS[key]
  if (!rule) return null
  const count =
    rule.by === 'driver'
      ? sms.driver_inspections
      : rule.by === 'vehicle'
        ? sms.vehicle_inspections
        : withViolation
  // Below FMCSA's minimum (e.g. fewer than 5 relevant inspections): FMCSA shows no grouping. With
  // enough relevant inspections FMCSA shows the group even without violations (checked on FMCSA's
  // SMS profile of USDOT 2763257: Driver Fitness, 0 of 14, "11-20 relevant driver inspections").
  if (count < rule.edges[0]) return 'No safety event group'
  let i = 0
  while (i + 1 < rule.edges.length && count >= rule.edges[i + 1]) i += 1
  const low = rule.edges[i]
  const high = rule.edges[i + 1]
  const range = high === undefined ? `${low}+` : high - 1 === low ? `${low}` : `${low}–${high - 1}`
  return `Safety event group: ${range} ${rule.noun}`
}

/**
 * The figures FMCSA's SMS profile shows under each BASIC: the measure, the inspections with
 * violations and the safety event group. Empty when SMS isn't loaded.
 */
export function tileFacts(
  key: string,
  sms: Sms | null,
  drivers: BasicDriver[] | null = null,
): string[] {
  const basic = sms?.basics.find((b) => b.key === key)
  if (!sms || !basic) return []
  const relevant = key === 'veh_maint' ? sms.vehicle_inspections : sms.driver_inspections
  const facts: string[] = []
  if (basic.measure !== null) facts.push(measureLine(key, basic.measure, drivers))
  if (key !== 'crash') {
    facts.push(
      `${basic.inspections_with_violation} of ${relevant} ${key === 'veh_maint' ? 'vehicle' : 'driver'} inspections with violations`,
    )
  }
  const group = eventGroup(key, sms, basic.inspections_with_violation)
  if (group) facts.push(group)
  // (An acute/critical violation turns the tile red and says so; none found isn't repeated here.)
  return facts
}

/** FMCSA SMS: an inspection's severity within one BASIC counts at most 30 (before time weight). */
const SEVERITY_CAP = 30
const capped = new WeakMap<SmsInspection, Map<SmsViolation, number>>()

/**
 * Each violation's severity as FMCSA counts it: total_weight (severity + 2 when out of service),
 * scaled down when the inspection's total in that BASIC is over 30. (backend: sms_points)
 */
function cappedSeverity(inspection: SmsInspection, v: SmsViolation): number {
  let byViolation = capped.get(inspection)
  if (!byViolation) {
    byViolation = new Map()
    const totals = new Map<string, number>()
    for (const x of inspection.violations) {
      totals.set(x.basic, (totals.get(x.basic) ?? 0) + x.total_weight)
    }
    for (const x of inspection.violations) {
      const total = totals.get(x.basic) ?? 0
      byViolation.set(
        x,
        total > SEVERITY_CAP ? (x.total_weight * SEVERITY_CAP) / total : x.total_weight,
      )
    }
    capped.set(inspection, byViolation)
  }
  return byViolation.get(v) ?? v.total_weight
}

/** A violation's points in FMCSA's SMS: its (capped) severity × its time weight (3, 2 or 1). */
export function smsPoints(inspection: SmsInspection, v: SmsViolation): number {
  return cappedSeverity(inspection, v) * v.time_weight
}

function addMonths(value: string, months: number): Date {
  const d = new Date(`${value}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return d
}

export interface ImprovementStep {
  date: Date
  inspection: SmsInspection
  /** What happens to the inspection's violations that day: [one violation, several] */
  change: readonly [string, string]
  /** Weight points the BASICs lose that day */
  points: number
  basics: string[]
}

/**
 * When the score gets better on its own: FMCSA weighs a violation 3× for 6 months after the
 * inspection, 2× until 12 months, 1× until 24 months, then stops counting it. The next steps,
 * soonest first.
 */
export function improvementSteps(
  inspections: SmsInspection[],
  today = new Date(),
): ImprovementStep[] {
  const steps: ImprovementStep[] = []
  for (const inspection of inspections) {
    // Each step lowers the time weight by 1 (3→2, 2→1, 1→0): the points drop by the severity.
    const base = inspection.violations.reduce((sum, v) => sum + cappedSeverity(inspection, v), 0)
    const basics = [...new Set(inspection.violations.map((v) => v.basic))]
    for (const [months, change] of [
      [6, ['weighs 2× instead of 3×', 'weigh 2× instead of 3×']],
      [12, ['weighs 1× instead of 2×', 'weigh 1× instead of 2×']],
      [24, ['stops counting', 'stop counting']],
    ] as const) {
      const date = addMonths(inspection.inspection_date, months)
      if (date > today) steps.push({ date, inspection, change, points: base, basics })
    }
  }
  return steps.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export interface ViolationRow {
  code: string
  description: string | null
  basic: string
  count: number
  outOfService: number
  severity: number
  weight: number
}

/** FMCSA's violation summary: one row per violation code, most SMS points first. */
export function violationRows(inspections: SmsInspection[]): ViolationRow[] {
  const rows = new Map<string, ViolationRow>()
  for (const [inspection, v] of inspections.flatMap((i) =>
    i.violations.map((x) => [i, x] as const),
  )) {
    const row = rows.get(v.code) ?? {
      code: v.code,
      description: v.description,
      basic: v.basic,
      count: 0,
      outOfService: 0,
      severity: v.severity_weight,
      weight: 0,
    }
    row.count += 1
    row.outOfService += v.out_of_service ? 1 : 0
    row.weight += smsPoints(inspection, v)
    rows.set(v.code, row)
  }
  return [...rows.values()].sort((a, b) => b.weight - a.weight || b.count - a.count)
}

export interface Challengeable {
  violation: SmsViolation
  inspection: SmsInspection
  /** Its points in FMCSA's SMS today */
  points: number
}

/**
 * The heaviest violations (most SMS points today), worth checking first: if one is wrong, a
 * DataQs challenge takes its points out of the BASIC.
 */
export function heaviestViolations(inspections: SmsInspection[], limit = 3): Challengeable[] {
  return inspections
    .flatMap((inspection) =>
      inspection.violations.map((violation) => ({
        violation,
        inspection,
        points: smsPoints(inspection, violation),
      })),
    )
    .filter(({ violation }) => basicKey(violation.basic) !== 'crash')
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
}

/** FMCSA's violation code as FMCSA prints it: "3958EHOSPDOOS" → "395.8EHOSPDOOS" (49 CFR part.section). */
export function violationCode(code: string): string {
  return /^\d{4}/.test(code) ? `${code.slice(0, 3)}.${code.slice(3)}` : code
}

/**
 * A record with more than 3 inspections with violations, or more than 10 violation codes, would be
 * printed too small on one page: it gets two (when the score improves, the heaviest violations and
 * the violation summary; then the inspection history, crashes and pull-in rates).
 */
export function recordNeedsTwoPages(safety: CarrierSafety): boolean {
  const inspections = safety.sms_inspections ?? []
  return inspections.length > 3 || violationRows(inspections).length > 10
}

const number = (value: number, decimals = 2) =>
  value.toLocaleString('en-US', { maximumFractionDigits: decimals })

/**
 * "Measure 3.22 = 58 points ÷ 18": FMCSA's measure is the BASIC's SMS points (severity × time
 * weight) divided by the carrier's exposure: time-weighted relevant inspections (a whole number),
 * or for Unsafe Driving its average power units × utilization factor. The divisor isn't published,
 * so it is what the points and FMCSA's (rounded) measure imply; "≈" unless the sum checks out.
 */
function measureLine(key: string, measure: number, drivers: BasicDriver[] | null): string {
  const shown = `Measure ${measure.toFixed(2)}`
  const points = drivers?.find((d) => basicKey(d.basic) === key)?.weight ?? 0
  if (measure <= 0 || points <= 0) return shown
  const unsafe = key === 'unsafe_driv'
  const divisor = unsafe ? points / measure : Math.round(points / measure)
  if (divisor <= 0) return shown
  const exact = Math.abs(points / divisor - measure) < 0.005
  return `${shown} ${exact ? '=' : '≈'} ${number(points, 1)} points ÷ ${number(divisor)}${
    unsafe ? ' (power units × utilization)' : ''
  }`
}

export interface TruckShare {
  vin: string
  /** Every plate the truck had on these inspections */
  plates: string[]
  points: number
  /** All Vehicle Maintenance points on the carrier's power units */
  total: number
  violations: number
  inspections: number
  trucks: number
  /** Inspections with truck violations that couldn't be tied to a VIN (left out) */
  unmatched: number
}

/**
 * The power unit with the most Vehicle Maintenance weight, when one truck carries at least 40% of
 * it among two or more trucks. Only violations FMCSA records on unit 1 (the power unit) count, on
 * inspections whose VIN is on file; trailer and driver violations are not a truck's.
 */
export function heaviestTruck(inspections: SmsInspection[]): TruckShare | null {
  const byVin = new Map<string, TruckShare>()
  let total = 0
  let unmatched = 0
  for (const inspection of inspections) {
    const own = inspection.violations.filter(
      (v) => v.unit === '1' && basicKey(v.basic) === 'veh_maint',
    )
    if (own.length === 0) continue
    if (!inspection.vin) {
      unmatched += 1
      continue
    }
    const points = own.reduce((sum, v) => sum + smsPoints(inspection, v), 0)
    total += points
    const row = byVin.get(inspection.vin) ?? {
      vin: inspection.vin,
      plates: [],
      points: 0,
      total: 0,
      violations: 0,
      inspections: 0,
      trucks: 0,
      unmatched: 0,
    }
    row.points += points
    if (inspection.plate && !row.plates.includes(inspection.plate))
      row.plates.push(inspection.plate)
    row.violations += own.length
    row.inspections += 1
    byVin.set(inspection.vin, row)
  }
  const top = [...byVin.values()].sort((a, b) => b.points - a.points)[0]
  if (!top || byVin.size < 2 || total <= 0 || top.points / total < 0.4) return null
  return { ...top, total, trucks: byVin.size, unmatched }
}

export interface RepeatViolation {
  code: string
  description: string | null
  basic: string
  inspections: number
}

/** The same violation code cited on 2 or more inspections, most inspections first. */
export function repeatViolations(inspections: SmsInspection[], limit = 3): RepeatViolation[] {
  const seen = new Map<string, RepeatViolation & { ids: Set<string> }>()
  for (const inspection of inspections) {
    for (const v of inspection.violations) {
      const row = seen.get(v.code) ?? {
        code: v.code,
        description: v.description,
        basic: v.basic,
        inspections: 0,
        ids: new Set<string>(),
      }
      row.ids.add(inspection.inspection_id)
      row.inspections = row.ids.size
      seen.set(v.code, row)
    }
  }
  return [...seen.values()]
    .filter((r) => r.inspections >= 2)
    .sort((a, b) => b.inspections - a.inspections)
    .slice(0, limit)
    .map(({ code, description, basic, inspections: n }) => ({
      code,
      description,
      basic,
      inspections: n,
    }))
}

/**
 * Inspections in FMCSA's 24-month SMS window with no violation counted in SMS: FMCSA's total
 * less those with SMS violations. Null until both are loaded.
 */
export function cleanInspections(safety: CarrierSafety): { clean: number; total: number } | null {
  const total = safety.sms?.inspections ?? 0
  if (!safety.sms_inspections || total <= 0) return null
  return { clean: Math.max(0, total - safety.sms_inspections.length), total }
}
