import type { Count } from '../../../types/carrierSafety'
import { levelLabel } from './inspectionLevels'

const TOP_STATES = 8

/** Where and how deeply the carrier was inspected: counts by FMCSA inspection level and by state. */
export function InspectionCounts({ byLevel, byState }: { byLevel: Count[]; byState: Count[] }) {
  if (byLevel.length === 0 && byState.length === 0) return null
  const otherStates = byState.slice(TOP_STATES).reduce((sum, c) => sum + c.inspections, 0)

  return (
    <div className="grid gap-6 text-sm sm:grid-cols-2">
      <div>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          By inspection level
        </h4>
        <ul className="space-y-1">
          {byLevel.map((c) => (
            <li key={c.key} className="flex justify-between gap-3">
              <span className="text-slate-700">
                {c.key === 'Unknown' ? 'Level not recorded' : levelLabel(c.key)}
              </span>
              <span className="tabular-nums text-slate-900">{c.inspections}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          By state
        </h4>
        <ul className="space-y-1">
          {byState.slice(0, TOP_STATES).map((c) => (
            <li key={c.key} className="flex justify-between gap-3">
              <span className="text-slate-700">
                {c.key === 'Unknown' ? 'State not recorded' : c.key}
              </span>
              <span className="tabular-nums text-slate-900">{c.inspections}</span>
            </li>
          ))}
          {otherStates > 0 && (
            <li className="flex justify-between gap-3 text-slate-500">
              <span>{byState.length - TOP_STATES} other states</span>
              <span className="tabular-nums">{otherStates}</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
