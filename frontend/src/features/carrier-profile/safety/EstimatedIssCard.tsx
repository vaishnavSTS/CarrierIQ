import { AlertTriangle, CircleCheck, Minus } from 'lucide-react'

import { StatusBadge } from '../../../components/StatusBadge'
import type { EstimatedIss } from '../../../types/carrierSafety'
import type { Tone } from '../../../utils/status'
import { Empty } from '../Section'

const BAND: Record<NonNullable<EstimatedIss['band']>, { label: string; tone: Tone }> = {
  PASS: { label: 'Pass', tone: 'ok' },
  OPTIONAL: { label: 'Optional', tone: 'warn' },
  INSPECT: { label: 'Inspect', tone: 'down' },
}

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
  const band = iss.band ? BAND[iss.band] : null
  const showPercentiles = iss.basics.some((b) => b.percentile !== null)

  return (
    <div className="rounded-xl border border-slate-200 bg-canvas/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Estimated ISS · inspection priority
          </div>
          <p className="mt-1 text-xs text-slate-500">
            CarrierIQ estimate from public FMCSA data — not FMCSA’s official ISS. 1–49 Pass · 50–74
            Optional · 75–100 Inspect. Lower is better.
          </p>
        </div>
        {iss.value !== null && band ? (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-semibold tabular-nums text-slate-950">{iss.value}</span>
            <StatusBadge label={band.label} tone={band.tone} />
          </div>
        ) : (
          <StatusBadge label="Not enough data" tone="neutral" />
        )}
      </div>

      <p className="mt-3 text-sm text-slate-800">
        <span className="text-slate-500">Why: </span>
        {iss.reason}.
      </p>

      {iss.basics.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {iss.basics.map((b) => (
            <li key={b.basic} className="flex items-center gap-2 text-sm">
              {b.over_threshold ? (
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
              ) : b.assessed ? (
                <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Minus className="size-4 shrink-0 text-slate-400" aria-hidden />
              )}
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
        Follows FMCSA’s published ISS and SMS methods. Crash history is not included yet. Based on
        FMCSA data for {monthLabel(iss.data_month)} · {iss.version}
      </p>
    </div>
  )
}
