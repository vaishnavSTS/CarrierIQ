import type { OosWindow } from '../../../types/carrierProfile'
import type { BasicDriver } from '../../../types/carrierSafety'
import { formatPercent } from '../../../utils/format'

/**
 * What usually helps with each BASIC and violation group: common industry practice and the
 * FMCSA rule behind it. Suggestions only, never a promise of a result.
 */

export const BASIC_TIPS: Record<string, string> = {
  'Vehicle Maintenance':
    'Driver pre-trip and post-trip inspections with written reports (49 CFR 396.11, 396.13), a preventive-maintenance schedule with kept records (396.3), and fixing defects before a truck is dispatched.',
  'Hours-of-Service Compliance':
    'ELD training for drivers, regular log reviews by the office, dispatch planned within the hours limits, and keeping supporting documents such as fuel and toll receipts (395.8, 395.11).',
  'Unsafe Driving':
    'Coaching on speed and following distance, speed and event alerts from telematics, and a written no-hand-held-phone policy (392.80, 392.82).',
  'Driver Fitness':
    'Complete driver qualification files (391.51), current medical certificates (391.41), and licence and record checks at each annual review (391.25).',
  'Controlled Substances/Alcohol':
    'An active DOT drug and alcohol testing program and the required FMCSA Drug & Alcohol Clearinghouse queries (Part 382).',
  'Hazardous Materials Compliance':
    'Hazmat training for drivers and a check of shipping papers, placards and securement before each load (Parts 172, 177).',
}

const GROUP_TIPS: [RegExp, string][] = [
  [
    /tire/i,
    'Tread depth and inflation checked in every pre-trip; tires replaced before 4/32 in. on steer axles and 2/32 in. on others (393.75).',
  ],
  [
    /brake/i,
    'Brake adjustment checked regularly and air leaks fixed before dispatch (393.47, 393.48).',
  ],
  [
    /light|lamp/i,
    'A walk-around lamp check before each trip, with spare bulbs and fuses in the truck.',
  ],
  [/log|eld|record/i, 'ELD training and a daily review of driver logs by the office.'],
  [/hours/i, 'Trips planned within the 11-hour, 14-hour and 60/70-hour limits.'],
  [/speed/i, 'Speed alerts or governors and coaching after speeding events.'],
  [
    /cargo|securement/i,
    'A load-securement check before departure and after the first 50 miles (392.9).',
  ],
  [/medical|physical/i, 'Medical certificates tracked with reminders before they expire.'],
  [/licen/i, 'Licence class and endorsements checked for each driver and route.'],
]

export function groupTip(group: string): string | null {
  return GROUP_TIPS.find(([pattern]) => pattern.test(group))?.[1] ?? null
}

export const DATAQS_URL = 'https://dataqs.fmcsa.dot.gov'

/**
 * Two sentences: which violations weigh most in the CSA measures (FMCSA's own weights), and what
 * reducing them would change. It says the measures, not the rating: a rating changes only after
 * an FMCSA review.
 */
export function improvementSummary(
  drivers: BasicDriver[] | null,
  recent: OosWindow | null,
): string | null {
  if (drivers === null) return null
  if (drivers.length === 0) {
    return 'No violations count against this carrier in the last 24 months. Clean inspections keep the CSA measures low.'
  }
  const picks = drivers
    .flatMap((b) => b.groups.slice(0, 2).map((g) => ({ basic: b.basic, group: g })))
    .sort((a, b) => b.group.weight - a.group.weight)
  // The heaviest group of the heaviest BASIC, then the heaviest from another BASIC if any.
  const first = { basic: drivers[0].basic, group: drivers[0].groups[0] }
  const second =
    picks.find((p) => p.basic !== first.basic) ?? picks.find((p) => p.group !== first.group)
  const named = [first, second]
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.group))
    .map((p) => `${p.group.group.toLowerCase()} (${formatPercent(p.group.share)} of ${p.basic})`)
  const oos =
    recent &&
    recent.vehicle_oos_rate !== null &&
    recent.vehicle_oos_rate > recent.national_vehicle_oos_rate
      ? `, and bring the vehicle out-of-service rate (${formatPercent(recent.vehicle_oos_rate)}) closer to the national average (${formatPercent(recent.national_vehicle_oos_rate)})`
      : ''
  return (
    `Most of the weight in the CSA measures comes from ${named.join(' and ')} violations. ` +
    `Fewer of these, and more clean inspections, would lower the measures the most${oos}.`
  )
}
