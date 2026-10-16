import type { Tone } from '../../utils/status'
import { formatMoney } from '../../utils/format'
import { brokerFlags } from '../carrier-profile/network/brokerFlags'
import type { CarrierFacts } from './useComparison'

/**
 * How a broker decides whether a carrier can get a load, from public FMCSA records only.
 * research_notes/CarrierIQ competitor landscape/broker_carrier_selection_criteria.md has the
 * sources. In order: hard stops (never book), then caution items (each needs a reason on file;
 * major ones on their own make a carrier high risk), then strengths. The thresholds (6 months of
 * authority, $1M liability) are common broker practice, not law.
 */

export type Verdict = 'do_not_book' | 'high_risk' | 'review' | 'ready'

export const VERDICT: Record<Verdict, { label: string; tone: Tone; order: number }> = {
  ready: { label: 'Ready to book', tone: 'ok', order: 0 },
  review: { label: 'Book with review', tone: 'warn', order: 1 },
  high_risk: { label: 'High risk', tone: 'down', order: 2 },
  do_not_book: { label: 'Do not book', tone: 'down', order: 3 },
}

export interface VetItem {
  key: string
  text: string
}

export interface Vetting {
  verdict: Verdict
  stops: VetItem[]
  major: VetItem[]
  minor: VetItem[]
  strengths: VetItem[]
  /** Months since the operating authority was last granted; null when no grant is on record */
  authorityMonths: number | null
}

/** Caution items that make a carrier high risk on their own count. */
export const MINOR_LIMIT = 3
export const NEW_AUTHORITY_MONTHS = 6
export const PREFERRED_LIABILITY = 1_000_000
export const FEDERAL_MIN_LIABILITY = 750_000
/** Fewer inspections than this in 24 months is too little to judge a carrier on. */
export const THIN_RECORD = 3
/** The CSA categories behind crash risk (FMCSA threshold 65%; the Montgomery fact pattern). */
const CRASH_BASICS = new Set(['unsafe_driv', 'hos_driv', 'crash'])

const MONTH_MS = 2.63e9

function monthsSince(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getTime()) / MONTH_MS,
  )
}

function ageText(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'}`
}

/** Months since the newest GRANTED action (a re-grant after revocation restarts the clock). */
export function authorityAge(f: CarrierFacts): number | null {
  const grants = (f.authority?.authority_history ?? [])
    .filter((a) => a.action.toUpperCase() === 'GRANTED' && a.action_date)
    .map((a) => a.action_date!)
    .sort()
  return grants.length ? monthsSince(grants[grants.length - 1]) : null
}

/** Highest liability (BIPD) on file across the carrier's dockets; null when none is recorded. */
function liabilityOnFile(f: CarrierFacts): number | null {
  const amounts = (f.authority?.dockets ?? [])
    .map((d) => Number(d.bipd_on_file ?? 0))
    .filter((n) => n > 0)
  return amounts.length ? Math.max(...amounts) : null
}

function liabilityRequired(f: CarrierFacts): number {
  const required = (f.authority?.dockets ?? []).map((d) => Number(d.bipd_required ?? 0))
  return Math.max(FEDERAL_MIN_LIABILITY, ...required)
}

/** Null until the profile, safety, authority and network data have all loaded. */
export function vetCarrier(f: CarrierFacts): Vetting | null {
  const { profile, safety, authority, network } = f
  if (!profile || !safety || !authority || !network) return null

  const stops: VetItem[] = []
  const major: VetItem[] = []
  const minor: VetItem[] = []
  const strengths: VetItem[] = []
  const flags = brokerFlags(network, profile).filter((flag) => flag.level !== 'info')
  const months = authorityAge(f)
  const rating = profile.safety.safety_rating
  const recent = profile.safety.recent
  const iss = safety.estimated_iss
  const liability = liabilityOnFile(f)

  // Hard stops: legally or practically can't be used.
  const status = profile.authority.status
  if (status !== 'ACTIVE') {
    stops.push({
      key: 'authority',
      text: status ? `Operating authority ${status.toLowerCase()}` : 'No operating authority',
    })
  }
  if (authority.dockets.some((d) => d.revocation_pending)) {
    stops.push({ key: 'revocation', text: 'Authority revocation pending' })
  }
  if (flags.some((flag) => flag.key === 'check-oos' && flag.level === 'alert')) {
    stops.push({ key: 'oos', text: 'Active FMCSA out-of-service order' })
  }
  if (rating === 'UNSATISFACTORY') {
    stops.push({ key: 'rating', text: 'Unsatisfactory FMCSA safety rating' })
  }
  if (status === 'ACTIVE' && profile.insurance.status !== 'ON_FILE') {
    stops.push({ key: 'insurance', text: 'No liability insurance on file with FMCSA' })
  } else if (liability !== null && liability < liabilityRequired(f)) {
    stops.push({
      key: 'insurance-min',
      text: `Liability ${formatMoney(liability)}, below the ${formatMoney(liabilityRequired(f))} legal minimum`,
    })
  }

  // Major caution items: each alone makes the carrier high risk.
  if (rating === 'CONDITIONAL') {
    major.push({ key: 'conditional', text: 'Conditional FMCSA safety rating' })
  }
  const overCrashBasics = (iss?.basics ?? []).filter(
    (b) => b.over_threshold && CRASH_BASICS.has(b.basic),
  )
  if (overCrashBasics.length) {
    major.push({
      key: 'crash-basics',
      text: `Over threshold in ${overCrashBasics.map((b) => b.label).join(', ')}`,
    })
  }
  if (iss?.band === 'INSPECT' && iss.algorithm !== 'INSUFFICIENT_DATA') {
    major.push({ key: 'iss-high', text: `Estimated ISS ${iss.value} (High risk)` })
  }
  for (const flag of flags) {
    if (flag.level === 'alert' && flag.key !== 'check-oos') {
      major.push({ key: flag.key, text: flag.title })
    }
  }
  const fleet = profile.equipment.power_units ?? 0
  if (months !== null && months < 12 && fleet >= 10) {
    major.push({
      key: 'new-big-fleet',
      text: `New authority (${ageText(months)}) with ${fleet} power units: a common fraud sign`,
    })
  }
  const fatal = safety.crashes?.recent_fatal ?? 0
  if (fatal > 0) {
    major.push({
      key: 'fatal',
      text: `${fatal} fatal crash${fatal === 1 ? '' : 'es'} in 24 months`,
    })
  }

  // Minor caution items: bookable, with a reason on file; three or more make it high risk.
  if (months !== null && months < NEW_AUTHORITY_MONTHS) {
    minor.push({ key: 'new', text: `Authority only ${ageText(months)} old` })
  } else if (months === null && status === 'ACTIVE') {
    minor.push({ key: 'age-unknown', text: 'Authority grant date not on record' })
  }
  const revoked = authority.authority_history.some(
    (a) =>
      /REVOCATION|^REVOKED$/.test(a.action.toUpperCase()) &&
      !a.action.toUpperCase().includes('DISCONTINUED') &&
      a.action_date !== null &&
      monthsSince(a.action_date) < 36,
  )
  if (revoked && status === 'ACTIVE') {
    minor.push({
      key: 'revoked-before',
      text: 'Authority revoked in the last 3 years, since reinstated',
    })
  }
  if (liability !== null && liability < PREFERRED_LIABILITY && stops.length === 0) {
    minor.push({
      key: 'liability',
      text: `Liability ${formatMoney(liability)}: most brokers require $1,000,000`,
    })
  }
  if (authority.renewals.some((r) => r.state === 'upcoming')) {
    minor.push({ key: 'renewal', text: 'Insurance renewal due within 30 days' })
  }
  const inspections = recent?.inspections ?? 0
  if (inspections < THIN_RECORD) {
    minor.push({
      key: 'thin',
      text: `Only ${inspections} inspection${inspections === 1 ? '' : 's'} in 24 months: too little to judge`,
    })
  }
  if (iss?.band === 'OPTIONAL' && iss.algorithm !== 'INSUFFICIENT_DATA') {
    minor.push({ key: 'iss-risk', text: `Estimated ISS ${iss.value} (At risk)` })
  }
  const overOther = (iss?.basics ?? []).filter(
    (b) => b.over_threshold && !CRASH_BASICS.has(b.basic),
  )
  if (overOther.length) {
    minor.push({
      key: 'other-basics',
      text: `Over threshold in ${overOther.map((b) => b.label).join(', ')}`,
    })
  }
  if (recent) {
    // A rate counts only on enough inspections of its kind: 1 OOS in 1 vehicle check is "100%".
    const high: string[] = []
    if (
      recent.vehicle_inspections >= THIN_RECORD &&
      recent.vehicle_oos_rate !== null &&
      recent.vehicle_oos_rate > recent.national_vehicle_oos_rate
    )
      high.push('vehicle')
    if (
      recent.driver_inspections >= THIN_RECORD &&
      recent.driver_oos_rate !== null &&
      recent.driver_oos_rate > recent.national_driver_oos_rate
    )
      high.push('driver')
    if (high.length) {
      minor.push({
        key: 'oos-rate',
        text: `${high.join(' and ')} out-of-service rate above national average`.replace(
          /^./,
          (c) => c.toUpperCase(),
        ),
      })
    }
  }
  const injury = safety.crashes?.recent_injury ?? 0
  if (fatal === 0 && injury > 0) {
    minor.push({
      key: 'injury',
      text: `${injury} injury crash${injury === 1 ? '' : 'es'} in 24 months`,
    })
  }
  const attention = flags.filter((flag) => flag.level === 'attention')
  const registration = attention.filter((flag) => flag.key.startsWith('check-'))
  const identity = attention.filter((flag) => !flag.key.startsWith('check-'))
  if (registration.length) {
    // Registration items (MCS-150, BOC-3, Motus) count once: paperwork, not a safety signal.
    minor.push({
      key: 'registration',
      text: `Registration to check: ${registration.map((a) => a.title).join(', ')}`,
    })
  }
  if (identity.length) {
    // Contacts shared with active carriers, transfers: worth a call. With a revoked carrier the
    // flag is red and counts as major above.
    minor.push({
      key: 'identity',
      text: `Identity to confirm: ${identity.map((a) => a.title).join(', ')}`,
    })
  }

  // Strengths.
  if (months !== null && months >= 36) {
    strengths.push({ key: 'established', text: `Authority ${ageText(months)} old` })
  }
  if (rating === 'SATISFACTORY')
    strengths.push({ key: 'satisfactory', text: 'Satisfactory safety rating' })
  if (
    recent &&
    inspections >= 10 &&
    (recent.vehicle_oos_rate ?? 0) <= recent.national_vehicle_oos_rate &&
    (recent.driver_oos_rate ?? 0) <= recent.national_driver_oos_rate
  ) {
    strengths.push({
      key: 'record',
      text: `${inspections} inspections, out-of-service rates below national average`,
    })
  }
  if (liability !== null && liability >= PREFERRED_LIABILITY) {
    strengths.push({ key: 'liability', text: `${formatMoney(liability)} liability on file` })
  }

  const verdict: Verdict = stops.length
    ? 'do_not_book'
    : major.length || minor.length >= MINOR_LIMIT
      ? 'high_risk'
      : minor.length
        ? 'review'
        : 'ready'
  return { verdict, stops, major, minor, strengths, authorityMonths: months }
}

/** Lower sorts first: verdict, then majors, minors, more strengths, lower ISS, older authority. */
function rankKey(f: CarrierFacts, v: Vetting): number[] {
  return [
    VERDICT[v.verdict].order,
    v.major.length,
    v.minor.length,
    -v.strengths.length,
    f.safety?.estimated_iss?.value ?? 101,
    -(v.authorityMonths ?? 0),
  ]
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export interface Ranked {
  vetting: Vetting | null
  /** 1 = best pick among bookable carriers; null for "do not book" or not loaded */
  rank: number | null
}

/** Each carrier's vetting and place; null until every carrier has loaded. */
export function rankCarriers(facts: CarrierFacts[]): Ranked[] | null {
  if (facts.length < 2) return null
  if (facts.some((f) => !f.profileError && (!f.profile || !f.safety || !f.authority || !f.network)))
    return null
  const vettings = facts.map((f) => (f.profileError ? null : vetCarrier(f)))
  const order = facts
    .map((f, i) => ({ i, v: vettings[i], key: vettings[i] ? rankKey(f, vettings[i]!) : [] }))
    .filter(
      (x): x is { i: number; v: Vetting; key: number[] } =>
        x.v !== null && x.v.verdict !== 'do_not_book',
    )
    .sort((a, b) => compareKeys(a.key, b.key))
  const ranks: (number | null)[] = facts.map(() => null)
  order.forEach(({ i, key }, n) => {
    ranks[i] = n > 0 && compareKeys(order[n - 1].key, key) === 0 ? ranks[order[n - 1].i] : n + 1
  })
  return facts.map((_, i) => ({ vetting: vettings[i], rank: ranks[i] }))
}
