import type { BasicDriver, CrashSummary, EstimatedIss, Sms } from '../../../types/carrierSafety'
import { ordinal } from '../../../utils/format'
import { NEAR_THRESHOLD_POINTS } from '../safety/issBand'

export type TileTone = 'red' | 'amber' | 'green' | 'grey'

export interface BasicTile {
  key: string
  label: string
  tone: TileTone
  /** Two or three words: what the record shows */
  status: string
  /** The figures behind the status */
  note: string
}

/** The packet's BASICs, in the order brokers usually read them. */
const BASICS: [key: string, label: string][] = [
  ['unsafe_driv', 'Unsafe Driving'],
  ['hos_driv', 'Hours of Service'],
  ['veh_maint', 'Vehicle Maintenance'],
  ['driv_fit', 'Driver Fitness'],
  ['contr_subst', 'Drugs & Alcohol'],
  ['crash', 'Crash Indicator'],
]

/**
 * FMCSA names a BASIC differently in each file ("HOS Compliance", "Hours-of-Service Compliance",
 * "Vehicle Maint."); this maps any of them to the SMS key.
 */
export function basicKey(name: string): string | null {
  if (/unsafe/i.test(name)) return 'unsafe_driv'
  if (/hos|hours/i.test(name)) return 'hos_driv'
  if (/fitness/i.test(name)) return 'driv_fit'
  if (/substance|alcohol/i.test(name)) return 'contr_subst'
  if (/maint/i.test(name)) return 'veh_maint'
  if (/crash/i.test(name)) return 'crash'
  if (/haz/i.test(name)) return 'hazmat'
  return null
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * One tile per BASIC for the packet's scorecard. Red: over FMCSA's intervention threshold, an
 * FMCSA alert, or an acute / critical violation. Amber: within 15 points of the threshold, or
 * out-of-service violations in the last 24 months. Green: below the threshold, or no violations.
 * Grey: violations, but too few inspections for FMCSA to assign a percentile.
 */
export function basicTiles(
  iss: EstimatedIss | null,
  sms: Sms | null,
  drivers: BasicDriver[] | null,
  crashes: CrashSummary | null,
): BasicTile[] {
  return BASICS.map(([key, label]) => {
    const estimate = iss?.basics.find((b) => b.basic === key)
    const published = sms?.basics.find((b) => b.key === key)
    const driver = drivers?.find((d) => basicKey(d.basic) === key)
    const percentile = estimate?.percentile ?? published?.percentile ?? null
    const threshold = estimate?.threshold ?? null
    const scored =
      percentile !== null && threshold !== null
        ? `${ordinal(percentile)} percentile · threshold ${threshold}`
        : threshold !== null
          ? `FMCSA threshold ${threshold}`
          : ''
    const counts = driver
      ? `${plural(driver.violations, 'violation')}${
          driver.out_of_service > 0 ? `, ${driver.out_of_service} out of service` : ''
        } in 24 months`
      : ''
    const note = (...parts: string[]) => parts.filter(Boolean).join(' · ')

    if (estimate?.over_threshold || published?.alert) {
      return { key, label, tone: 'red', status: 'Over FMCSA threshold', note: note(scored, counts) }
    }
    if (published?.acute_critical) {
      return {
        key,
        label,
        tone: 'red',
        status: 'Acute / critical violation',
        note: 'Found in an FMCSA investigation in the last 12 months',
      }
    }
    if (
      percentile !== null &&
      threshold !== null &&
      percentile >= threshold - NEAR_THRESHOLD_POINTS
    ) {
      return { key, label, tone: 'amber', status: 'Close to threshold', note: note(scored, counts) }
    }
    if (driver && driver.out_of_service > 0) {
      return {
        key,
        label,
        tone: 'amber',
        status: 'Out-of-service violations',
        note: note(counts, estimate?.assessed ? 'below threshold' : ''),
      }
    }
    if (key === 'crash') {
      if (!crashes) return { key, label, tone: 'grey', status: 'Not loaded', note: '' }
      if (crashes.recent_total === 0) {
        return { key, label, tone: 'green', status: 'No crashes', note: 'Last 24 months' }
      }
      return {
        key,
        label,
        tone: estimate?.assessed ? 'green' : 'amber',
        status: estimate?.assessed ? 'Below threshold' : plural(crashes.recent_total, 'crash'),
        note: `${crashes.recent_fatal} fatal · ${crashes.recent_injury} with injury · 24 months`,
      }
    }
    if (!driver || driver.violations === 0) {
      return {
        key,
        label,
        tone: drivers === null ? 'grey' : 'green',
        status: drivers === null ? 'Not loaded' : 'No violations',
        note: drivers === null ? '' : 'Last 24 months',
      }
    }
    if (estimate?.assessed) {
      return { key, label, tone: 'green', status: 'Below threshold', note: note(scored, counts) }
    }
    if (!estimate) {
      // No Estimated ISS (its monthly tables aren't loaded): nothing to say about the score.
      return { key, label, tone: 'grey', status: 'Score not available', note: counts }
    }
    return { key, label, tone: 'grey', status: 'Too few inspections to score', note: counts }
  })
}
