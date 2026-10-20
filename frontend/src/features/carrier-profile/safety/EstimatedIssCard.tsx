import { AlertTriangle, CircleAlert, CircleCheck, Minus } from 'lucide-react'

import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'
import { formatLocalDate, ordinal } from '../../../utils/format'
import { Empty } from '../Section'
import { IssGauge } from './IssGauge'
import { ISS_BAND, NEAR_THRESHOLD_POINTS } from './issBand'

function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * CarrierSafetyScan's estimate of FMCSA's Inspection Selection System value (docs/estimated-iss-v1.md):
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
            CarrierSafetyScan’s estimate from public FMCSA data, not FMCSA’s official ISS. Bands:
            1–49 Satisfactory · 50–74 At risk · 75–100 High risk.
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

      <ScoreHistory history={history} />

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

/** The saved scores, newest first, so a change (and when it happened) is visible. */
function ScoreHistory({ history }: { history: IssHistoryEntry[] }) {
  if (history.length === 0) return null
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Score history
      </div>
      {history.length === 1 ? (
        <p className="mt-1 text-xs text-slate-500">
          Saved since {formatLocalDate(history[0].recorded_at)}. Each change is added here.
        </p>
      ) : (
        <ol className="mt-2 flex flex-wrap gap-2">
          {history.map((h, i) => {
            const band = h.band ? ISS_BAND[h.band] : null
            return (
              <li
                key={`${h.recorded_at}-${i}`}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                title={`${h.reason} · FMCSA data for ${monthLabel(h.data_month)} · ${h.version}`}
              >
                <span className="font-semibold tabular-nums text-slate-900">{h.value ?? '—'}</span>
                {band && <span className="text-slate-600"> {band.status}</span>}
                <span className="block text-slate-500">{formatLocalDate(h.recorded_at)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
