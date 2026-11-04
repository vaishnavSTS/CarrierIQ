import type { CarrierProfile } from '../../../types/carrierProfile'
import type { Renewal } from '../../../types/carrierAuthority'
import type { DataQsCaseSummary } from '../../../types/dataqs'
import type { CarrierNetwork } from '../../../types/network'
import type { Tone } from '../../../utils/status'
import { formatDate, formatDateTime, formatMonth } from '../../../utils/format'
import { brokerFlags } from '../../carrier-profile/network/brokerFlags'
import { WORK_STATUS } from '../../dataqs/labels'
import { mcs150Due } from '../../landing/HeroTools'

/**
 * How pressing an item is. alert/attention: a broker's check would flag it, or a DataQs case
 * waits on the carrier. due: a date in the next few months. working: STS or the agency has the
 * next step. scheduled: a date further out, shown so it isn't forgotten.
 */
export type ActionLevel = 'alert' | 'attention' | 'due' | 'working' | 'scheduled'

export interface ActionItem {
  key: string
  kind: 'flag' | 'mcs150' | 'renewal' | 'dataqs'
  level: ActionLevel
  title: string
  detail: string
  /** The full explanation, for a tooltip */
  more?: string
  badge?: { label: string; tone: Tone }
  to: string
  linkLabel: string
  /** Broker-check flags: the topic for "Fix it with Sky Transport Solutions" */
  fixTopic?: string
}

const ORDER: Record<ActionLevel, number> = {
  alert: 0,
  attention: 1,
  due: 2,
  working: 3,
  scheduled: 4,
}

/** Items that need the carrier to act (not dates still to come, not STS's work). */
export function needsAction(item: ActionItem): boolean {
  return item.level === 'alert' || item.level === 'attention'
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
const monthName = (month: number) => MONTH.format(new Date(Date.UTC(2000, month, 1)))

/**
 * The next MCS-150 month under 49 CFR 390.19 (mcs150Due). Already filed in this cycle's month:
 * the next one is two years on.
 */
export function nextMcs150(
  usdot: number,
  lastFiled: string | null,
  today = new Date(),
): { month: number; year: number } | null {
  const due = mcs150Due(String(usdot), today)
  if (!due || !lastFiled) return due
  const [year, month] = lastFiled.split('-').map(Number)
  return year === due.year && month - 1 === due.month ? { ...due, year: due.year + 2 } : due
}

const INSURANCE: Record<string, string> = {
  BIPD: 'Liability (BI&PD)',
  CARGO: 'Cargo',
  BOND: 'Surety bond',
  TRUST_FUND: 'Trust fund',
}

const OWNER_BADGE: Record<NonNullable<DataQsCaseSummary['action_owner']>, string> = {
  CARRIER: 'Waiting on you',
  STS: 'STS is on it',
  AGENCY: 'With the agency',
}

/**
 * What needs the carrier's attention, most pressing first: what a broker's check would flag,
 * DataQs cases and their next step, the MCS-150 month and expected insurance renewals. Only from
 * what the API returned; anything still loading is simply not listed yet.
 */
export function actionItems({
  profile,
  network,
  renewals,
  cases,
  page,
  today = new Date(),
}: {
  profile: CarrierProfile
  network: CarrierNetwork | undefined
  renewals: Renewal[] | undefined
  /** This carrier's DataQs cases */
  cases: DataQsCaseSummary[]
  /** The carrier page in the portal */
  page: string
  today?: Date
}): ActionItem[] {
  const items: ActionItem[] = []
  const flags = network ? brokerFlags(network, profile).filter((f) => f.level !== 'info') : []
  const flagged = new Set(flags.map((f) => f.key))

  for (const f of flags) {
    items.push({
      key: f.key,
      kind: 'flag',
      level: f.level === 'alert' ? 'alert' : 'attention',
      title: f.title,
      detail: f.why,
      more: `Usually fixed by: ${f.fix}`,
      to: `${page}?tab=network`,
      linkLabel: 'How it’s usually fixed',
      fixTopic: f.title,
    })
  }

  for (const c of cases) {
    if (c.work_status === 'CLOSED') continue
    const owner = c.action_owner
    items.push({
      key: `dataqs-${c.id}`,
      kind: 'dataqs',
      level: owner === 'CARRIER' ? 'attention' : 'working',
      title: `DataQs case ${c.id} · inspection ${formatDate(c.event_date)}${c.event_state ? `, ${c.event_state}` : ''}`,
      detail:
        c.next_action +
        (c.next_deadline_at
          ? ` · ${c.next_deadline_label ?? 'Due'}: ${formatDateTime(c.next_deadline_at)}`
          : ''),
      badge: owner
        ? { label: OWNER_BADGE[owner], tone: owner === 'CARRIER' ? 'warn' : 'pending' }
        : WORK_STATUS[c.work_status],
      to: `/portal/dataqs/cases/${c.id}`,
      linkLabel: 'Open the case',
    })
  }

  // Overdue already shows as the broker-check flag above (FMCSA census date + 24 months).
  if (!flagged.has('check-mcs150')) {
    const due = nextMcs150(profile.usdot_number, profile.last_mcs150_date, today)
    if (due) {
      const monthsAway = (due.year - today.getFullYear()) * 12 + (due.month - today.getMonth())
      items.push({
        key: 'mcs150-schedule',
        kind: 'mcs150',
        level: monthsAway <= 2 ? 'due' : 'scheduled',
        title: `MCS-150 update due by the end of ${monthName(due.month)} ${due.year}`,
        detail: `49 CFR 390.19 sets the month from the last two digits of your USDOT number. ${
          profile.last_mcs150_date
            ? `Last filed with FMCSA: ${formatDate(profile.last_mcs150_date)}.`
            : 'FMCSA has no MCS-150 date on file.'
        }`,
        to: page,
        linkLabel: 'Company details',
      })
    }
  }

  // Unconfirmed renewals are already broker-check flags; passed ones have no date to plan for.
  for (const r of renewals ?? []) {
    if (r.state !== 'pattern' && r.state !== 'upcoming') continue
    if (flagged.has(`check-renewal_${r.insurance_type.toLowerCase()}`)) continue
    items.push({
      key: `renewal-${r.docket}-${r.insurance_type}`,
      kind: 'renewal',
      level: r.state === 'upcoming' ? 'due' : 'scheduled',
      title: `${INSURANCE[r.insurance_type] ?? r.insurance_type} insurance renewal expected around ${formatMonth(r.expected)}`,
      detail: `An estimate from past FMCSA filing start dates (${r.docket}); FMCSA publishes no renewal date.`,
      more: r.summary,
      badge: { label: 'Estimate', tone: 'neutral' },
      to: `${page}?tab=authority`,
      linkLabel: 'Insurance on file',
    })
  }

  return items.sort((a, b) => ORDER[a.level] - ORDER[b.level])
}
