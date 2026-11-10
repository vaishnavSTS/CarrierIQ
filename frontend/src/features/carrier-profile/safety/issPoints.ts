import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'

export interface IssPoint {
  /** When the score was saved (ISO timestamp) */
  at: string
  value: number | null
  band: EstimatedIss['band']
  /** FMCSA SMS month the score was calculated from (YYYY-MM-DD) */
  data_month: string
}

function same(a: Pick<IssPoint, 'value' | 'band' | 'data_month'>, b: typeof a): boolean {
  return a.value === b.value && a.band === b.band && a.data_month === b.data_month
}

/**
 * Every saved Estimated ISS, oldest first: a score is saved each day the carrier is looked up and
 * whenever it changes. Ends on the live score, added when the newest saved one differs from it.
 */
export function issPoints(
  iss: EstimatedIss,
  history: IssHistoryEntry[],
  now: Date = new Date(),
): IssPoint[] {
  const points: IssPoint[] = [...history].reverse().map((h) => ({
    at: h.recorded_at,
    value: h.value,
    band: h.band,
    data_month: h.data_month,
  }))
  const newest = points[points.length - 1]
  if (!newest || !same(newest, iss)) {
    points.push({
      at: now.toISOString(),
      value: iss.value,
      band: iss.band,
      data_month: iss.data_month,
    })
  }
  return points
}

/** The saved scores where something changed, newest first: the list under the graph. */
export function issChanges(history: IssHistoryEntry[]): IssHistoryEntry[] {
  return history.filter((h, i) => {
    const older = history[i + 1]
    return !older || !same(h, older)
  })
}
