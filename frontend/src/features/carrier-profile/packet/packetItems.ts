import type { CarrierAuthority } from '../../../types/carrierAuthority'
import type { CrashSummary, EstimatedIss, Sms } from '../../../types/carrierSafety'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierNetwork } from '../../../types/network'
import { formatDate, formatMoney, formatPercent, humanize, ordinal } from '../../../utils/format'
import type { BrokerFlag } from '../network/brokerFlags'
import { basicTip } from '../safety/improvementTips'
import { NEAR_THRESHOLD_POINTS } from '../safety/issBand'

/** What a passed registration check found, as the report's green list says it. */
const GOOD_TITLES: Record<string, string> = {
  motus: 'Authority and insurance listed in Motus (FMCSA’s current system)',
  boc3: 'Process agent (BOC-3) listed in Motus',
  // Only the filing's age is checked (FMCSA's due date also depends on the USDOT number).
  mcs150: 'MCS-150 filed within the last 2 years',
  prior_revoke: 'No link to a previously revoked USDOT number',
  oos: 'No out-of-service orders',
  revocations: 'No revocation or suspension orders',
}

export interface PacketItem {
  key: string
  title: string
  detail: string | null
  /** What usually resolves it: a suggestion, never a promised result */
  fix?: string | null
}

export interface PacketLists {
  /** Red: what raises the Estimated ISS or what a broker's check is likely to stop on */
  hurting: PacketItem[]
  /** Amber: worth watching before it becomes a problem */
  watch: PacketItem[]
  /** Green: what FMCSA's records show in order */
  good: PacketItem[]
}

/** The first sentence of a check's explanation; the full text is on the Network tab. */
export function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}

/** Fewer inspections than this and an out-of-service rate is shown as a watch item only. */
const FEW_INSPECTIONS = 5

const OOS_FIX = {
  vehicle:
    'Pre-trip and post-trip inspections with written reports, and fixing brakes, tires and lights before a truck is dispatched (49 CFR 396.11, 396.13).',
  driver:
    'Checking logs, medical certificates and licences before dispatch, so a driver is never stopped for hours, fitness or paperwork (Parts 391, 395).',
}

/**
 * The packet's three lists, from the same checks as the other tabs. Every item names its record;
 * none is a verdict on the carrier.
 */
export function packetItems(
  profile: CarrierProfile,
  authority: CarrierAuthority,
  network: CarrierNetwork,
  flags: BrokerFlag[],
  sms: Sms | null = null,
  crashes: CrashSummary | null = null,
  iss: EstimatedIss | null = null,
): PacketLists {
  const hurting: PacketItem[] = []
  const watch: PacketItem[] = []
  const good: PacketItem[] = []

  // Safety first: it is what a broker looks at first.
  const flagged = new Set<string>()
  for (const b of iss?.basics ?? []) {
    const tip = basicTip(b.label)
    if (b.over_threshold) {
      flagged.add(b.basic)
      hurting.push({
        key: `basic-${b.basic}`,
        title: `${b.label} over FMCSA’s intervention threshold`,
        detail: `${b.percentile !== null ? `Estimated ${ordinal(b.percentile)} percentile; ` : ''}FMCSA’s threshold is ${b.threshold}. This BASIC raises the Estimated ISS the most.`,
        fix: tip,
      })
    } else if (b.percentile !== null && b.percentile >= b.threshold - NEAR_THRESHOLD_POINTS) {
      flagged.add(b.basic)
      watch.push({
        key: `basic-${b.basic}`,
        title: `${b.label} close to FMCSA’s threshold`,
        detail: `Estimated ${ordinal(b.percentile)} percentile; FMCSA’s threshold is ${b.threshold}.`,
        fix: tip,
      })
    }
  }
  for (const b of sms?.basics ?? []) {
    if (flagged.has(b.key) || !(b.alert || b.acute_critical)) continue
    hurting.push({
      key: `basic-${b.key}`,
      title: `${b.label}: ${b.alert ? 'FMCSA alert' : 'acute / critical violation'}`,
      detail: b.alert
        ? `FMCSA’s SMS shows an alert for this BASIC${b.percentile !== null ? ` (${ordinal(b.percentile)} percentile)` : ''}.`
        : 'FMCSA’s SMS records an acute or critical violation found in an investigation in the last 12 months.',
      fix: basicTip(b.label),
    })
  }

  const recent = profile.safety.recent
  if (recent) {
    for (const [unit, rate, national, oos, base] of [
      [
        'vehicle',
        recent.vehicle_oos_rate,
        recent.national_vehicle_oos_rate,
        recent.vehicle_oos,
        recent.vehicle_inspections,
      ],
      [
        'driver',
        recent.driver_oos_rate,
        recent.national_driver_oos_rate,
        recent.driver_oos,
        recent.driver_inspections,
      ],
    ] as const) {
      if (rate === null) continue
      const figures = `${oos} of ${base} inspections that examined the ${unit} (${formatPercent(rate)}) in the last ${recent.months} months; FMCSA’s national average is ${formatPercent(national)}.`
      if (rate > national) {
        const item = {
          key: `${unit}-oos`,
          title: `${humanize(unit)} out-of-service rate above the national average`,
          detail: base < FEW_INSPECTIONS ? `${figures} Based on few inspections.` : figures,
          fix: OOS_FIX[unit],
        }
        if (base < FEW_INSPECTIONS) watch.push(item)
        else hurting.push(item)
      } else {
        good.push({
          key: `${unit}-oos`,
          title: `${humanize(unit)} out-of-service rate at or below the national average`,
          detail: figures,
        })
      }
    }
  }

  if (crashes && crashes.recent_fatal > 0) {
    hurting.push({
      key: 'fatal-crash',
      title: 'Fatal crash in the last 24 months',
      detail: `FMCSA’s Crash File lists ${crashes.recent_fatal} crash${crashes.recent_fatal === 1 ? '' : 'es'} with a fatality in the last ${crashes.recent_months} months; the file does not say who was at fault.`,
      fix: 'If the crash was not preventable, FMCSA’s Crash Preventability program (through DataQs) can mark it so it no longer counts against the carrier.',
    })
  } else if (crashes && crashes.recent_total === 0) {
    good.push({
      key: 'no-crashes',
      title: 'No crashes in the last 24 months',
      detail: 'FMCSA’s Crash File lists none.',
    })
  }

  for (const f of flags) {
    if (f.level === 'info') continue
    const item = { key: f.key, title: f.title, detail: firstSentence(f.why), fix: f.fix || null }
    if (f.level === 'alert') hurting.push(item)
    else watch.push(item)
  }

  for (const d of authority.dockets) {
    if (d.status === 'ACTIVE') {
      good.push({
        key: `authority-${d.prefix}${d.number}`,
        title: `Operating authority active (${d.prefix}${d.number})`,
        detail: `FMCSA lists ${d.authority_type ?? 'the authority'} as active.`,
      })
    }
  }
  if (profile.insurance.status === 'ON_FILE') {
    const d = authority.dockets.find((x) => x.bipd_on_file)
    good.push({
      key: 'insurance',
      title: 'Liability insurance on file',
      detail: d
        ? `FMCSA lists ${formatMoney(d.bipd_on_file)} BI&PD on file (${formatMoney(d.bipd_required)} required).`
        : 'FMCSA lists BI&PD insurance on file.',
    })
  }
  // FMCSA's authority history can show revocations (since reinstated) that Motus' revocation list
  // doesn't: then "no revocation or suspension orders" would mislead, so it isn't listed as good.
  const revokedBefore = authority.authority_history.some((a) => {
    const action = a.action.toUpperCase()
    return /REVOC|REVOK|SUSPEN/.test(action) && !action.includes('DISCONTINUED')
  })
  for (const check of network.registration_checks) {
    if (check.key === 'revocations' && revokedBefore) continue
    if (check.status === 'ok') {
      good.push({
        key: `check-${check.key}`,
        // The check's name ("Out-of-service orders") reads like a problem on a green line, so
        // the report says what was found.
        title: GOOD_TITLES[check.key] ?? check.label,
        detail: firstSentence(check.detail),
      })
    }
  }
  if (profile.safety.safety_rating === 'SATISFACTORY') {
    good.push({
      key: 'rating',
      title: 'Satisfactory safety rating',
      detail: `FMCSA rated the carrier Satisfactory${
        profile.safety.safety_rating_date
          ? ` on ${formatDate(profile.safety.safety_rating_date)}`
          : ''
      }.`,
    })
  }
  if (profile.first_registered_date) {
    const years = Math.floor(
      (Date.now() - new Date(profile.first_registered_date).getTime()) / (365.25 * 86400000),
    )
    if (years >= 2) {
      good.push({
        key: 'established',
        title: `Registered ${years} years`,
        detail: `FMCSA’s census lists the USDOT number as added on ${formatDate(profile.first_registered_date)}.`,
      })
    }
  }
  return { hurting, watch, good }
}
