import type { CarrierSafety, Sms, SmsInspection, SmsViolation } from '../../../types/carrierSafety'
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
export function tileFacts(key: string, sms: Sms | null): string[] {
  const basic = sms?.basics.find((b) => b.key === key)
  if (!sms || !basic) return []
  const relevant = key === 'veh_maint' ? sms.vehicle_inspections : sms.driver_inspections
  const facts: string[] = []
  if (basic.measure !== null) facts.push(`Measure ${basic.measure.toFixed(2)}`)
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

/** A violation's weight before FMCSA's time weight: severity (+2 when out of service), capped. */
function baseWeight(v: SmsViolation): number {
  return v.time_weight > 0 ? v.total_weight / v.time_weight : v.total_weight
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
    const base = inspection.violations.reduce((sum, v) => sum + baseWeight(v), 0)
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

/** FMCSA's violation summary: one row per violation code, heaviest total weight first. */
export function violationRows(inspections: SmsInspection[]): ViolationRow[] {
  const rows = new Map<string, ViolationRow>()
  for (const v of inspections.flatMap((i) => i.violations)) {
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
    row.weight += v.total_weight
    rows.set(v.code, row)
  }
  return [...rows.values()].sort((a, b) => b.weight - a.weight || b.count - a.count)
}

export interface Challengeable {
  violation: SmsViolation
  inspection: SmsInspection
}

/**
 * The heaviest violations (most weight in the score), worth checking first: if one is wrong, a
 * DataQs challenge takes its whole weight out of the BASIC.
 */
export function heaviestViolations(inspections: SmsInspection[], limit = 3): Challengeable[] {
  return inspections
    .flatMap((inspection) => inspection.violations.map((violation) => ({ violation, inspection })))
    .filter(({ violation }) => basicKey(violation.basic) !== 'crash')
    .sort((a, b) => b.violation.total_weight - a.violation.total_weight)
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
