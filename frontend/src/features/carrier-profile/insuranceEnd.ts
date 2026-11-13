/** An end date this close is shown as coming up. */
export const ENDING_SOON_DAYS = 30

export interface PolicyEnd {
  /** ISO date (YYYY-MM-DD) */
  date: string
  /** Days from today; 0 = today */
  daysLeft: number
  /** Policy years rolled forward because earlier end dates have passed (the filing is still on file) */
  renewals: number
}

const DAY_MS = 24 * 3600 * 1000

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

/** The same calendar date `years` later; Feb 29 becomes Feb 28 in a year that isn't a leap year. */
function sameDateLater(year: number, month: number, day: number, years: number): number {
  const target = year + years
  const lastDay = new Date(Date.UTC(target, month + 1, 0)).getUTCDate()
  return Date.UTC(target, month, Math.min(day, lastDay))
}

/**
 * Estimated end of the current policy year of a filing still on file. FMCSA records no expiry
 * date, so it is one calendar year after the effective date (Sep 23, 2025 -> Sep 23, 2026); a
 * filing still on file after that has most likely renewed, so the date moves on a year at a time
 * to the next end date not yet passed.
 */
export function policyEnd(effective: string | null, today: Date = new Date()): PolicyEnd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(effective ?? '')
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const now = utcDay(today)
  for (let years = 1; years <= 100; years++) {
    const end = sameDateLater(year, month, day, years)
    if (end >= now) {
      return {
        date: new Date(end).toISOString().slice(0, 10),
        daysLeft: Math.round((end - now) / DAY_MS),
        renewals: years - 1,
      }
    }
  }
  return null
}
