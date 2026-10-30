import type { OosWindow } from '../../../types/carrierProfile'
import type { Fleet } from '../../../types/carrierEquipment'
import type { BasicDriver, EstimatedIss, Sms, SmsInspection } from '../../../types/carrierSafety'
import { formatPercent } from '../../../utils/format'
import { basicKey } from './basicTiles'
import { improvementSteps, type TruckShare } from './recordDetail'

/** One step of the report's plan: what to do, and how, in plain English. */
export interface Solution {
  key: string
  title: string
  how: string
}

/** What to do about each BASIC, in plain words (the FMCSA rules are on the Safety tab). */
const BASIC_SOLUTIONS: Record<string, { title: string; how: string }> = {
  unsafe_driv: {
    title: 'Cut speeding and risky driving',
    how: 'Turn on speed alerts in the trucks or the ELD, talk with a driver after every ticket or warning, and do not allow hand-held phone use while driving.',
  },
  hos_driv: {
    title: 'Keep driver logs clean',
    how: 'Train drivers on the ELD, have the office check logs every week, and plan loads so drivers stay inside the 11-hour, 14-hour and 60/70-hour limits.',
  },
  veh_maint: {
    title: 'Fix trucks before they leave the yard',
    how: 'Have drivers check brakes, tires and lights before every trip and write down any defect, fix defects before dispatch, and keep a regular service schedule.',
  },
  driv_fit: {
    title: 'Keep driver paperwork current',
    how: 'Check each driver’s licence class, medical card and driving record when hiring and once a year, and set reminders before medical cards expire.',
  },
  contr_subst: {
    title: 'Run a DOT drug and alcohol program',
    how: 'Enrol every driver in a DOT testing program and run the required Drug & Alcohol Clearinghouse checks when hiring and once a year.',
  },
  hazmat: {
    title: 'Check hazmat loads before they leave',
    how: 'Train hazmat drivers, and check shipping papers, placards and load securement before every hazmat trip.',
  },
  crash: {
    title: 'Ask FMCSA to review crashes that were not preventable',
    how: 'Some crash types, such as being hit from behind, can be submitted to FMCSA’s Crash Preventability program through DataQs. A crash found not preventable stops counting in the Crash Indicator.',
  },
}

/**
 * The plan on page 2 of the report: the steps most likely to lower this carrier's CSA measures,
 * most important first, from the same records as the rest of the report. Suggestions only; the
 * score depends on future inspections and FMCSA's monthly update.
 */
export function solutions({
  iss,
  sms,
  drivers,
  recent,
  inspections,
  truck,
  fleet,
  client,
  max,
}: {
  iss: EstimatedIss | null
  sms: Sms | null
  drivers: BasicDriver[] | null
  recent: OosWindow | null
  inspections: SmsInspection[] | null
  truck: TruckShare | null
  fleet: Fleet | null
  client: boolean
  /** How many steps to give, most important first */
  max: number
}): Solution[] {
  const out: Solution[] = []
  const added = new Set<string>()
  const addBasic = (key: string | null) => {
    if (!key || added.has(key) || !BASIC_SOLUTIONS[key]) return
    added.add(key)
    out.push({ key: `basic-${key}`, ...BASIC_SOLUTIONS[key] })
  }

  // 1. The BASICs that raise the score: over the threshold or flagged by FMCSA, worst first.
  const ranked = [...(iss?.basics ?? [])]
    .filter((b) => b.over_threshold)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
  for (const b of ranked) addBasic(basicKey(b.label))
  for (const b of sms?.basics ?? []) if (b.alert || b.acute_critical) addBasic(basicKey(b.label))

  // 2. Wrong violations can be removed: the fastest change when one applies.
  if ((inspections ?? []).some((i) => i.violations.length > 0)) {
    out.push({
      key: 'dataqs',
      title: 'Challenge violations that are wrong',
      how: `Check the heaviest violations in this report. If one was cited by mistake, file a DataQs challenge to have it reviewed; if the challenge is accepted, the violation is removed and stops counting.${client ? ' Sky Transport Solutions can file it for you.' : ''}`,
    })
  }

  // 3. One truck carrying most of the maintenance points.
  if (truck) {
    out.push({
      key: 'truck',
      title: 'Start with one truck',
      how: `The truck with VIN ${truck.vin} carries ${formatPercent(truck.points / truck.total)} of the Vehicle Maintenance points on the inspected trucks. Repair it and check it before every trip so the same problems are not cited again.`,
    })
  }

  // 4. Out-of-service rates above the national average point to the matching habits.
  if (
    recent?.vehicle_oos_rate != null &&
    recent.vehicle_oos_rate > recent.national_vehicle_oos_rate
  )
    addBasic('veh_maint')
  if (recent?.driver_oos_rate != null && recent.driver_oos_rate > recent.national_driver_oos_rate) {
    // The driver BASIC with the most weight, else logs (the most common driver out-of-service).
    const driverBasic = (drivers ?? [])
      .map((d) => basicKey(d.basic))
      .find((k) => k === 'hos_driv' || k === 'driv_fit' || k === 'contr_subst')
    addBasic(driverBasic ?? 'hos_driv')
  }

  // 5. Nothing flagged yet: the BASIC where most of the weight is.
  if (added.size === 0 && drivers?.length) addBasic(basicKey(drivers[0].basic))

  // 6. Too few trucks on the MCS-150 raises the Unsafe Driving and Crash measures.
  if (
    fleet &&
    fleet.registered_power_units !== null &&
    fleet.recent_power_units > fleet.registered_power_units
  ) {
    out.push({
      key: 'mcs150',
      title: 'Update the MCS-150 truck count',
      how: `Inspections show ${fleet.recent_power_units} trucks but the MCS-150 lists ${fleet.registered_power_units}. FMCSA divides the Unsafe Driving and Crash measures by the truck count and miles, so a count that is too low makes them higher.`,
    })
  }

  // 7. Clean inspections count in the carrier's favour.
  out.push({
    key: 'clean',
    title: 'Aim for clean inspections',
    how: 'Every inspection with no violations lowers the Hours-of-Service, Vehicle Maintenance and Driver Fitness measures, because FMCSA divides the violation points by the number of inspections.',
  })

  // 8. Time: violations weigh less as they age and stop counting after 24 months.
  const next = improvementSteps(inspections ?? [])[0]
  if (next) {
    out.push({
      key: 'time',
      title: 'Keep the record clean while old violations age',
      how: `FMCSA counts a violation 3× for 6 months, 2× until 12 months and 1× until 24 months, then drops it. The next drop is on ${next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
    })
  }

  return out.slice(0, max)
}
