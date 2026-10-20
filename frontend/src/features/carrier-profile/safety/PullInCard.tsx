import type { Count, PullIn } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { Empty } from '../Section'
import { stateName } from './usStates'

const STATE_NOTE =
  'Each state sets these rates and can change them at any time; PrePass does not set them.'

function range(pullIn: PullIn): string {
  return pullIn.band_min === pullIn.band_max
    ? `range ${pullIn.band_min}`
    : `range ${pullIn.band_min}–${pullIn.band_max}`
}

function Marks({ home, inspections }: { home: boolean; inspections: number }) {
  const marks = [home && 'Home state', inspections > 0 && `Inspected here (${inspections})`].filter(
    Boolean,
  )
  if (marks.length === 0) return null
  return <span className="block text-[11px] text-slate-500">{marks.join(' · ')}</span>
}

/**
 * How likely a PrePass-equipped truck of this carrier is to be pulled in for inspection at a
 * weigh station, state by state. FMCSA gives the carrier one ISS score, the same everywhere;
 * each state decides its pull-in rate for that score's range. Only states with a rate on file
 * are listed; the carrier's home state and inspected states without one are named separately.
 */
export function PullInCard({
  pullIn,
  byState,
  homeState,
}: {
  pullIn: PullIn | null | undefined
  byState: Count[]
  homeState: string | null
}) {
  if (!pullIn) {
    return (
      <Empty>
        No Estimated ISS yet, so the chance of being pulled in at weigh stations can’t be shown.
      </Empty>
    )
  }
  const home = homeState?.toUpperCase() ?? null
  const inspected = new Map(byState.map((c) => [c.key.toUpperCase(), c.inspections]))
  const listed = new Set(pullIn.rates.map((r) => r.state))
  const unlisted = [
    ...new Set([...(home ? [home] : []), ...inspected.keys()].filter((s) => s.length === 2)),
  ].filter((s) => !listed.has(s))
  const drops = pullIn.what_if?.drops.slice(0, 2) ?? []

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        <span className="font-semibold text-slate-900">Estimated ISS {pullIn.score}</span> ·{' '}
        {range(pullIn)}
        {pullIn.beyond_table && ' (above the table’s last range: its strictest rates are shown)'}.
        The ISS is one score used in every state; each state decides how often it pulls in a truck
        with that score.
      </p>

      <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {pullIn.rates.map((r) => (
          <li
            key={r.state}
            className="rounded-md border border-slate-200 px-3 py-2"
            title={r.percent === null ? 'No rate given for this ISS range' : undefined}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-slate-700">
                {stateName(r.state)} <span className="text-xs text-slate-500">{r.state}</span>
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {r.percent === null ? '—' : `${r.percent}%`}
              </span>
            </span>
            <Marks home={r.state === home} inspections={inspected.get(r.state) ?? 0} />
          </li>
        ))}
      </ul>

      {unlisted.length > 0 && (
        <p className="text-slate-700">
          <span className="font-medium text-slate-900">No rate on file yet:</span>{' '}
          {unlisted
            .map((s) => {
              const notes = [
                s === home && 'home state',
                (inspected.get(s) ?? 0) > 0 && 'inspected here',
              ].filter(Boolean)
              return `${stateName(s)}${notes.length ? ` (${notes.join(', ')})` : ''}`
            })
            .join(', ')}
          .
        </p>
      )}

      {pullIn.what_if && drops.length > 0 && (
        <p className="text-slate-700">
          <span className="font-medium text-slate-900">
            With an Estimated ISS below {pullIn.what_if.below}:
          </span>{' '}
          {drops
            .map((d) => `${stateName(d.state)} drops from ${d.from_percent}% to ${d.to_percent}%`)
            .join('; ')}
          .
        </p>
      )}

      <p className="text-xs text-slate-500">
        {pullIn.source}, as of {formatDate(pullIn.effective_date)}. Rates are the share of
        PrePass-equipped trucks pulled in at weigh stations; “—” means no rate was given for this
        range. {STATE_NOTE}
      </p>
    </div>
  )
}
