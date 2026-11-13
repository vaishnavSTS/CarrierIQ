/** An end date this close is shown as coming up. */
export const ENDING_SOON_DAYS = 30

export interface PolicyEnd {
  /** ISO date (YYYY-MM-DD) */
  date: string
  /** Days from today; 0 = today, negative = already passed */
  daysLeft: number
  /** Policy years rolled forward because FMCSA's data showed the filing on file after the end */
  renewals: number
  /** The end date has passed, and FMCSA's data stops before it, so a renewal can't be confirmed */
  unconfirmed: boolean
}

const DAY_MS = 24 * 3600 * 1000

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function isoDay(value: string | null | undefined): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  return match ? [Number(match[1]), Number(match[2]) - 1, Number(match[3])] : null
}

/** The same calendar date `years` later; Feb 29 becomes Feb 28 in a year that isn't a leap year. */
function sameDateLater(year: number, month: number, day: number, years: number): number {
  const target = year + years
  const lastDay = new Date(Date.UTC(target, month + 1, 0)).getUTCDate()
  return Date.UTC(target, month, Math.min(day, lastDay))
}

/**
 * Estimated end of a filing's current policy year. FMCSA records no expiry date, so it is one
 * calendar year after the effective date (Sep 23, 2025 -> Sep 23, 2026). It moves on a year only
 * when FMCSA's data (as of `asOf`) still showed the filing on file after that end date, i.e. it
 * renewed. Data that stops before the end date (the old L&I system, frozen May 14, 2026) can't
 * show a renewal: the passed date is kept and marked unconfirmed.
 */
export function policyEnd(
  effective: string | null,
  asOf: string | null = null,
  today: Date = new Date(),
): PolicyEnd | null {
  const start = isoDay(effective)
  if (!start) return null
  const now = utcDay(today)
  const seen = isoDay(asOf)
  const dataDay = seen ? Math.min(Date.UTC(...seen), now) : now
  let years = 1
  let end = sameDateLater(...start, years)
  // Roll on only past end dates the data has seen the filing outlive.
  while (end < dataDay && years < 100) end = sameDateLater(...start, ++years)
  return {
    date: new Date(end).toISOString().slice(0, 10),
    daysLeft: Math.round((end - now) / DAY_MS),
    renewals: years - 1,
    unconfirmed: end < now,
  }
}
