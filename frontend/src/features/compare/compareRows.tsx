import type { ReactNode } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import { formatDate, formatMoney, formatPercent } from '../../utils/format'
import { INSURANCE_LABEL, insuranceTone, statusTone } from '../../utils/status'
import { brokerFlags, type BrokerFlag } from '../carrier-profile/network/brokerFlags'
import { ISS_BAND } from '../carrier-profile/safety/issBand'
import type { CarrierFacts } from './useComparison'

/**
 * One line of the comparison. `value` is what the cell shows (undefined while loading);
 * `score`, when set, ranks carriers on that line (null = nothing to rank on) and the best one is
 * highlighted. Rows without a score are context only (fleet size, location).
 */
export interface CompareRow {
  key: string
  label: string
  hint?: string
  value: (f: CarrierFacts) => ReactNode | undefined
  score?: (f: CarrierFacts) => number | null | undefined
  better?: 'low' | 'high'
}

const muted = (text: string) => <span className="text-slate-400">{text}</span>

const RATING_RANK: Record<string, number> = { SATISFACTORY: 0, CONDITIONAL: 2, UNSATISFACTORY: 3 }

function yearsSince(isoDate: string): string {
  const months = Math.floor((Date.now() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 2.63e9)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'}`
}

/**
 * The broker-check items, led by inactive authority: the profile shows that in its header, not
 * in the checklist, but side by side it must count, or an inactive carrier can look cleanest.
 */
function flagsOf(f: CarrierFacts): Pick<BrokerFlag, 'key' | 'level' | 'title'>[] | undefined {
  if (!f.network || !f.profile) return undefined
  const flags = brokerFlags(f.network, f.profile).filter((flag) => flag.level !== 'info')
  const status = f.profile.authority.status
  return status && status !== 'ACTIVE'
    ? [
        { key: 'authority', level: 'alert', title: `Operating authority ${status.toLowerCase()}` },
        ...flags,
      ]
    : flags
}

function oosRow(kind: 'vehicle' | 'driver'): CompareRow {
  return {
    key: `${kind}-oos`,
    label: `${kind === 'vehicle' ? 'Vehicle' : 'Driver'} out-of-service rate`,
    hint: 'Last 24 months · lower is better',
    value: (f) => {
      if (!f.profile) return undefined
      const recent = f.profile.safety.recent
      if (!recent) return muted('No recent inspections')
      const rate = kind === 'vehicle' ? recent.vehicle_oos_rate : recent.driver_oos_rate
      const national =
        kind === 'vehicle' ? recent.national_vehicle_oos_rate : recent.national_driver_oos_rate
      const above = rate !== null && rate > national
      return (
        <>
          <span className={`font-semibold tabular-nums ${above ? 'text-amber-700' : ''}`}>
            {formatPercent(rate)}
          </span>
          <span className="block text-xs text-slate-500">
            national average {formatPercent(national)}
          </span>
        </>
      )
    },
    score: (f) => {
      if (!f.profile) return undefined
      const recent = f.profile.safety.recent
      if (!recent) return null
      return kind === 'vehicle' ? recent.vehicle_oos_rate : recent.driver_oos_rate
    },
    better: 'low',
  }
}

export const COMPARE_ROWS: CompareRow[] = [
  {
    key: 'authority',
    label: 'Operating authority',
    hint: 'Needed to haul freight for hire',
    value: (f) =>
      f.profile ? (
        f.profile.authority.status ? (
          <StatusBadge
            label={f.profile.authority.status}
            tone={statusTone(f.profile.authority.status)}
          />
        ) : (
          muted('No dockets')
        )
      ) : undefined,
    score: (f) => (f.profile ? (f.profile.authority.status === 'ACTIVE' ? 0 : 1) : undefined),
    better: 'low',
  },
  {
    key: 'insurance',
    label: 'Liability insurance',
    hint: 'On file with FMCSA',
    value: (f) => {
      if (!f.profile) return undefined
      const status = f.profile.insurance.status
      const bipd = f.authority?.dockets
        .map((d) => Number(d.bipd_on_file ?? 0))
        .reduce((a, b) => Math.max(a, b), 0)
      return (
        <>
          {status ? (
            <StatusBadge label={INSURANCE_LABEL[status] ?? status} tone={insuranceTone(status)} />
          ) : (
            muted('No active authority')
          )}
          {bipd ? (
            <span className="block text-xs text-slate-500">{formatMoney(bipd)} on file</span>
          ) : null}
        </>
      )
    },
    score: (f) => (f.profile ? (f.profile.insurance.status === 'ON_FILE' ? 0 : 1) : undefined),
    better: 'low',
  },
  {
    key: 'renewal',
    label: 'Next insurance renewal',
    hint: 'Estimated from past filings',
    value: (f) => {
      if (!f.authority) return undefined
      const next = [...f.authority.renewals]
        .filter((r) => r.state !== 'passed')
        .sort((a, b) => a.expected.localeCompare(b.expected))[0]
      if (!next) return muted('No pattern yet')
      return (
        <>
          {formatDate(next.expected)}
          {next.state === 'upcoming' && (
            <span className="ml-1.5">
              <StatusBadge label="within 30 days" tone="warn" />
            </span>
          )}
        </>
      )
    },
  },
  {
    key: 'iss',
    label: 'Estimated ISS',
    hint: '1–100 · lower is better',
    value: (f) => {
      if (!f.safety) return undefined
      const iss = f.safety.estimated_iss
      if (iss?.value == null || !iss.band) return muted('Not enough data')
      const band = ISS_BAND[iss.band]
      return (
        <span className="inline-flex items-center gap-2">
          <span className="text-lg font-semibold tabular-nums">{iss.value}</span>
          <StatusBadge label={band.status} tone={band.tone} />
        </span>
      )
    },
    score: (f) => (f.safety ? (f.safety.estimated_iss?.value ?? null) : undefined),
    better: 'low',
  },
  {
    key: 'basics',
    label: 'Safety categories over threshold',
    hint: 'Estimated, from FMCSA’s CSA categories',
    value: (f) => {
      if (!f.safety) return undefined
      const iss = f.safety.estimated_iss
      if (!iss) return muted('Not enough data')
      const over = iss.basics.filter((b) => b.over_threshold)
      if (over.length === 0) return 'None'
      return (
        <ul className="space-y-0.5">
          {over.map((b) => (
            <li key={b.basic} className="text-red-700">
              {b.label}
            </li>
          ))}
        </ul>
      )
    },
    score: (f) =>
      f.safety
        ? f.safety.estimated_iss
          ? f.safety.estimated_iss.basics.filter((b) => b.over_threshold).length
          : null
        : undefined,
    better: 'low',
  },
  oosRow('vehicle'),
  oosRow('driver'),
  {
    key: 'crashes',
    label: 'Crashes',
    hint: 'Reported to FMCSA · lower is better',
    value: (f) => {
      if (!f.safety) return undefined
      const c = f.safety.crashes
      if (!c) return muted('Not loaded')
      return (
        <>
          <span className="font-semibold tabular-nums">{c.recent_total}</span>
          <span className="text-slate-500"> in {c.recent_months} months</span>
          {(c.recent_fatal > 0 || c.recent_injury > 0) && (
            <span className="block text-xs text-red-700">
              {c.recent_fatal} fatal · {c.recent_injury} injury
            </span>
          )}
        </>
      )
    },
    score: (f) => (f.safety ? (f.safety.crashes?.recent_total ?? null) : undefined),
    better: 'low',
  },
  {
    key: 'inspections',
    label: 'Roadside inspections',
    hint: 'Last 24 months · more gives a more reliable picture',
    value: (f) =>
      f.profile ? (
        <span className="tabular-nums">{f.profile.safety.recent?.inspections ?? 0}</span>
      ) : undefined,
  },
  {
    key: 'rating',
    label: 'FMCSA safety rating',
    hint: 'From a compliance review',
    value: (f) => {
      if (!f.profile) return undefined
      const { safety_rating: rating, safety_rating_date: date } = f.profile.safety
      if (!rating) return muted('Not rated')
      return (
        <>
          <StatusBadge
            label={rating.charAt(0) + rating.slice(1).toLowerCase()}
            tone={rating === 'SATISFACTORY' ? 'ok' : rating === 'CONDITIONAL' ? 'warn' : 'down'}
          />
          {date && <span className="block text-xs text-slate-500">{formatDate(date)}</span>}
        </>
      )
    },
    score: (f) => {
      if (!f.profile) return undefined
      const rating = f.profile.safety.safety_rating
      return rating ? (RATING_RANK[rating] ?? null) : 1
    },
    better: 'low',
  },
  {
    key: 'flags',
    label: 'What a broker’s check would flag',
    hint: 'Registration, linked carriers, out-of-service orders',
    value: (f) => {
      const flags = flagsOf(f)
      if (!flags) return undefined
      if (flags.length === 0) return 'Nothing flagged'
      return (
        <ul className="space-y-1">
          {flags.slice(0, 3).map((flag) => (
            <li
              key={flag.key}
              className={flag.level === 'alert' ? 'text-red-700' : 'text-amber-700'}
            >
              {flag.title}
            </li>
          ))}
          {flags.length > 3 && (
            <li className="text-xs text-slate-500">and {flags.length - 3} more</li>
          )}
        </ul>
      )
    },
    // An alert outweighs any number of attention items.
    score: (f) => {
      const flags = flagsOf(f)
      return flags
        ? flags.reduce((sum, flag) => sum + (flag.level === 'alert' ? 10 : 1), 0)
        : undefined
    },
    better: 'low',
  },
  {
    key: 'age',
    label: 'Registered with FMCSA',
    hint: 'Longer track record is usually safer',
    value: (f) => {
      if (!f.profile) return undefined
      const since = f.profile.first_registered_date
      if (!since) return muted('Unknown')
      return (
        <>
          {yearsSince(since)}
          <span className="block text-xs text-slate-500">since {formatDate(since)}</span>
        </>
      )
    },
    score: (f) =>
      f.profile
        ? f.profile.first_registered_date
          ? -new Date(f.profile.first_registered_date).getTime()
          : null
        : undefined,
    // Older date = larger negative timestamp = longer history.
    better: 'high',
  },
  {
    key: 'fleet',
    label: 'Fleet',
    value: (f) =>
      f.profile ? (
        <>
          {f.profile.equipment.power_units ?? '—'} power units
          <span className="block text-xs text-slate-500">
            {f.profile.driver_count ?? '—'} drivers
          </span>
        </>
      ) : undefined,
  },
  {
    key: 'location',
    label: 'Based in',
    value: (f) => {
      if (!f.profile) return undefined
      const address =
        f.profile.addresses.find((a) => a.address_type === 'PHYSICAL') ?? f.profile.addresses[0]
      return address ? [address.city, address.state].filter(Boolean).join(', ') : muted('—')
    },
  },
]

/**
 * Which carriers are best on a row: indexes of the best score, once every carrier's score is
 * known. Empty when fewer than two carriers can be ranked or all are equal.
 */
export function bestOnRow(row: CompareRow, facts: CarrierFacts[]): number[] {
  if (!row.score || facts.length < 2) return []
  const scores = facts.map((f) => row.score!(f))
  if (scores.some((s) => s === undefined)) return []
  const ranked = scores.filter((s): s is number => s !== null)
  if (ranked.length < 2) return []
  const best = row.better === 'high' ? Math.max(...ranked) : Math.min(...ranked)
  if (ranked.every((s) => s === best)) return []
  return scores.flatMap((s, i) => (s === best ? [i] : []))
}
