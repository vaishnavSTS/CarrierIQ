import type { CarrierSafety } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'

/** The states shown: where the carrier was inspected most. */
const MAX_STATES = 8

/**
 * Weigh-station pull-in rates (PrePass) at the carrier's Estimated ISS, for the states where it
 * was inspected most. Shown beside the score on the scorecard, since the score sets them.
 */
export function PullInRates({ safety, client }: { safety: CarrierSafety; client: boolean }) {
  const pullIn = safety.pull_in
  const states = new Set(safety.by_state.slice(0, MAX_STATES).map((s) => s.key))
  const rates = (pullIn?.rates ?? []).filter((r) => states.has(r.state) && r.percent !== null)
  if (!pullIn || rates.length === 0) return null
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-slate-900">Weigh-station pull-in rates</span>
        <span className="text-xs text-slate-500">At an Estimated ISS of {pullIn.score}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rates.map((r) => (
          <span
            key={r.state}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-sm tabular-nums"
          >
            <span className="font-semibold text-slate-900">{r.state}</span>{' '}
            <span className="text-slate-700">{r.percent}%</span>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        States where {client ? 'you were' : 'it was'} inspected most; each state sets its own rate
        (PrePass, {formatDate(pullIn.effective_date)}). A lower score lowers them.
      </p>
    </div>
  )
}
