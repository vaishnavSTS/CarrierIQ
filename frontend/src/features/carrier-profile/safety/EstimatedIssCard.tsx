import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Minus,
  MoveRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'
import { formatLocalDate, formatMonth, ordinal } from '../../../utils/format'
import { Empty } from '../Section'
import { IssGauge } from './IssGauge'
import { IssHistoryChart } from './IssHistoryChart'
import { issChanges, issPoints, type IssPoint } from './issPoints'
import { ISS_BAND, NEAR_THRESHOLD_POINTS } from './issBand'

function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Carrier Safety Scan's estimate of FMCSA's Inspection Selection System value (docs/estimated-iss-v1.md):
 * the band, why, and each BASIC against FMCSA's threshold. Estimated percentiles show for STS
 * staff only; the client portal receives them blank.
 */
export function EstimatedIssCard({
  iss,
  history = [],
}: {
  iss: EstimatedIss | null | undefined
  /** Saved results, newest first */
  history?: IssHistoryEntry[]
}) {
  if (!iss) {
    return <Empty>The Estimated ISS is not available yet for this carrier.</Empty>
  }
  const showPercentiles = iss.basics.some((b) => b.percentile !== null)

  return (
    <div className="rounded-xl border border-slate-200 bg-canvas/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Estimated ISS – Safety score · inspection priority
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Carrier Safety Scan’s estimate from public FMCSA data, not FMCSA’s official ISS. Bands:
            1–49 Satisfactory · 50–74 At risk · 75–100 High risk. FMCSA data:{' '}
            {formatMonth(iss.data_month)}.
          </p>
          <p className="mt-3 text-sm text-slate-800">
            <span className="text-slate-500">Why: </span>
            {iss.reason}.
          </p>
          {iss.algorithm === 'INSUFFICIENT_DATA' && (
            <p className="mt-2 text-xs text-slate-500">
              Too few inspections to score the safety categories, so FMCSA’s rules for carriers with
              little inspection history apply. These carriers rank higher for inspection until more
              inspections build up.
            </p>
          )}
        </div>
        <IssGauge iss={iss} className="w-40" />
      </div>

      {iss.basics.length > 0 && iss.algorithm !== 'INSUFFICIENT_DATA' && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {iss.basics.map((b) => (
            <li key={b.basic} className="flex items-center gap-2 text-sm">
              <BasicIcon basic={b} />
              <span className="text-slate-800">{b.label}</span>
              <span className="ml-auto text-xs text-slate-500">
                {!b.assessed
                  ? 'Insufficient data'
                  : showPercentiles && b.percentile !== null
                    ? `estimated ${ordinal(b.percentile)} percentile · threshold ${b.threshold}`
                    : `${b.over_threshold ? 'Over' : 'Under'} FMCSA’s threshold (${b.threshold})`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ScoreHistory iss={iss} history={history} />

      <p className="mt-3 text-xs text-slate-500">
        Follows FMCSA’s published ISS-CSA and SMS methods, using FMCSA’s monthly SMS national file
        for {monthLabel(iss.data_month)} · {iss.version}. Percentiles rank the carrier against
        similar carriers (higher is worse); a threshold is FMCSA’s intervention threshold.
      </p>
    </div>
  )
}

type Basic = EstimatedIss['basics'][number]

/** Over the threshold: warning. Within 15 points under it: close to it. Further under: a tick. */
function BasicIcon({ basic: b }: { basic: Basic }) {
  if (b.over_threshold) {
    return <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-label="Over threshold" />
  }
  if (!b.assessed) return <Minus className="size-4 shrink-0 text-slate-400" aria-hidden />
  if (b.percentile !== null && b.percentile >= b.threshold - NEAR_THRESHOLD_POINTS) {
    return (
      <CircleAlert className="size-4 shrink-0 text-amber-600" aria-label="Close to threshold" />
    )
  }
  return (
    <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-label="Well under threshold" />
  )
}

/** Score changes listed under the graph */
const MAX_CHANGES = 12

const BAND_EDGE: Record<NonNullable<EstimatedIss['band']>, string> = {
  PASS: 'border-l-emerald-500',
  OPTIONAL: 'border-l-amber-500',
  INSPECT: 'border-l-red-500',
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-sm text-slate-900">{children}</div>
    </div>
  )
}

/** Latest, change since the first saved check, lowest, highest and how many checks. */
function HistoryStats({ points }: { points: IssPoint[] }) {
  const scored = points.filter((p): p is IssPoint & { value: number } => p.value !== null)
  if (scored.length === 0) return null
  const first = scored[0]
  const latest = scored[scored.length - 1]
  const change = latest.value - first.value
  const values = scored.map((p) => p.value)
  const Trend = change < 0 ? TrendingDown : change > 0 ? TrendingUp : MoveRight
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Stat label="Latest">
        <span className="text-xl font-semibold tabular-nums">{latest.value}</span>
        {latest.band && (
          <span className="text-xs text-slate-600">{ISS_BAND[latest.band].status}</span>
        )}
      </Stat>
      {scored.length > 1 && (
        <>
          <Stat label={`Since ${formatLocalDate(first.at)}`}>
            <Trend
              className={`size-4 self-center ${
                change < 0 ? 'text-emerald-600' : change > 0 ? 'text-red-600' : 'text-slate-400'
              }`}
              aria-hidden
            />
            <span className="text-xl font-semibold tabular-nums">
              {change === 0 ? '0' : change > 0 ? `+${change}` : change}
            </span>
            <span className="text-xs text-slate-600">
              {change < 0 ? 'better' : change > 0 ? 'worse' : 'no change'}
            </span>
          </Stat>
          <Stat label="Lowest">
            <span className="text-xl font-semibold tabular-nums">{Math.min(...values)}</span>
          </Stat>
          <Stat label="Highest">
            <span className="text-xl font-semibold tabular-nums">{Math.max(...values)}</span>
          </Stat>
        </>
      )}
      <Stat label="Checks saved">
        <span className="text-xl font-semibold tabular-nums">{points.length}</span>
      </Stat>
    </div>
  )
}

/**
 * Every saved score as a graph (one point per day the carrier was checked, and per change), then
 * the changes, newest first, so a change (and when it happened) is visible.
 */
function ScoreHistory({ iss, history }: { iss: EstimatedIss; history: IssHistoryEntry[] }) {
  if (history.length === 0) return null
  const points = issPoints(iss, history)
  const changes = issChanges(history).slice(0, MAX_CHANGES)
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">Score history</div>
        <div className="text-xs text-slate-500">
          Saved since {formatLocalDate(points[0].at)} · a point is added each day the carrier is
          checked
        </div>
      </div>
      <HistoryStats points={points} />
      <div className="mt-3">
        <IssHistoryChart points={points} />
      </div>
      {changes.length > 1 && (
        <>
          <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Changes
          </div>
          <ol className="mt-1.5 flex flex-wrap gap-2">
            {changes.map((h, i) => {
              const band = h.band ? ISS_BAND[h.band] : null
              return (
                <li
                  key={`${h.recorded_at}-${i}`}
                  className={`rounded-md border border-l-4 border-slate-200 bg-white px-2.5 py-1 text-xs ${
                    h.band ? BAND_EDGE[h.band] : 'border-l-slate-300'
                  }`}
                  title={`${h.reason} · FMCSA data for ${monthLabel(h.data_month)} · ${h.version}`}
                >
                  <span className="font-semibold tabular-nums text-slate-900">
                    {h.value ?? '—'}
                  </span>
                  {band && <span className="text-slate-600"> {band.status}</span>}
                  <span className="block text-slate-500">{formatLocalDate(h.recorded_at)}</span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
