import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'

export interface IssMonth {
  /** FMCSA SMS month (YYYY-MM-01) */
  month: string
  value: number | null
  band: EstimatedIss['band']
  /** True when no result was saved in this month, so the previous month's result still held */
  carried: boolean
}

/** YYYY-MM-DD -> the next month's first day. */
function nextMonth(month: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * One Estimated ISS per FMCSA month, from the first saved result to the current one. A result is
 * saved only when it changes, so a month with nothing saved keeps the previous month's score; in
 * a month with several, the newest counts. The current month is the live result.
 */
export function issByMonth(iss: EstimatedIss, history: IssHistoryEntry[]): IssMonth[] {
  const newestByMonth = new Map<string, IssHistoryEntry>()
  for (const h of history) {
    const key = h.data_month.slice(0, 7)
    if (!newestByMonth.has(key)) newestByMonth.set(key, h) // history is newest first
  }
  const current = iss.data_month.slice(0, 7)
  const first = [...newestByMonth.keys(), current].sort()[0]

  const months: IssMonth[] = []
  let held: { value: number | null; band: EstimatedIss['band'] } | null = null
  for (let m = `${first}-01`; m.slice(0, 7) <= current; m = nextMonth(m)) {
    const key = m.slice(0, 7)
    const saved = key === current ? iss : newestByMonth.get(key)
    if (saved) held = { value: saved.value, band: saved.band }
    if (held) months.push({ month: m, ...held, carried: !saved })
  }
  return months
}
