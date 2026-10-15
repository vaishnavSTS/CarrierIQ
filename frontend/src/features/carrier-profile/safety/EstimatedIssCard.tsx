import { AlertTriangle, CircleAlert, CircleCheck, Minus } from 'lucide-react'

import { StatusBadge } from '../../../components/StatusBadge'
import type { EstimatedIss } from '../../../types/carrierSafety'
import { Empty } from '../Section'
import { ISS_BAND, NEAR_THRESHOLD_POINTS } from './issBand'

function monthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * CarrierIQ's estimate of FMCSA's Inspection Selection System value (docs/estimated-iss-v1.md):
 * the band, why, and each BASIC against FMCSA's threshold. Estimated percentiles show for STS
 * staff only; the client portal receives them blank.
 */
export function EstimatedIssCard({ iss }: { iss: EstimatedIss | null | undefined }) {
  if (!iss) {
    return <Empty>The Estimated ISS is not available yet for this carrier.</Empty>
  }
  const band = iss.band ? ISS_BAND[iss.band] : null
  const showPercentiles = iss.basics.some((b) => b.percentile !== null)

  return (
    <div className="rounded-xl border border-slate-200 bg-canvas/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Estimated ISS – Safety score · inspection priority
          </div>
          <p className="mt-1 text-xs text-slate-500">
            CarrierIQ estimate from public FMCSA data — not FMCSA’s official ISS. 1–49 Satisfactory
            · 50–74 At risk · 75–100 High risk. Lower is better.
          </p>
        </div>
        {iss.value !== null && band ? (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-semibold tabular-nums text-slate-950">{iss.value}</span>
            <StatusBadge label={band.status} tone={band.tone} />
          </div>
        ) : (
          <StatusBadge label="Not enough data" tone="neutral" />
        )}
      </div>

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

      {iss.basics.length > 0 && iss.algorithm !== 'INSUFFICIENT_DATA' && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {iss.basics.map((b) => (
            <li key={b.basic} className="flex items-center gap-2 text-sm">
              <BasicIcon basic={b} />
              <span className="text-slate-800">{b.label}</span>
              <span className="ml-auto text-xs text-slate-500">
                {!b.assessed
                  ? 'not enough data'
                  : showPercentiles && b.percentile !== null
                    ? `est. ${Math.round(b.percentile)}th pct · threshold ${b.threshold}%`
                    : `${b.over_threshold ? 'over' : 'under'} FMCSA’s ${b.threshold}% threshold`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Follows FMCSA’s published ISS and SMS methods. Based on FMCSA data for{' '}
        {monthLabel(iss.data_month)} · {iss.version}
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
      <CircleAlert className="size-4 shrink-0 text-yellow-500" aria-label="Close to threshold" />
    )
  }
  return (
    <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-label="Well under threshold" />
  )
}
