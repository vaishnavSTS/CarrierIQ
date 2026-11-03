import { useState } from 'react'

import { StackTable } from '../../../components/StackTable'
import type { SmsInspection } from '../../../types/carrierSafety'
import { plainGroup } from '../packet/plainLabels'
import { truckRecords } from '../packet/recordDetail'
import { Empty } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

const FIRST = 10

/** Which trucks bring in the Vehicle Maintenance violations, and what keeps coming back on each. */
export function TruckRecords({ inspections }: { inspections: SmsInspection[] }) {
  const [all, setAll] = useState(false)
  const { trucks, unmatched } = truckRecords(inspections)
  const shown = all ? trucks : trucks.slice(0, FIRST)
  return (
    <div className="space-y-2">
      {trucks.length === 0 ? (
        <Empty>No Vehicle Maintenance violations on a power unit in FMCSA’s current window.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-surface">
          <StackTable className={tableClass}>
            <thead>
              <tr className={headClass}>
                <th className={cellClass}>Truck</th>
                <th className={`${cellClass} text-right`}>Inspections</th>
                <th className={`${cellClass} text-right`}>Violations</th>
                <th className={`${cellClass} text-right`}>Out of service</th>
                <th className={`${cellClass} text-right`}>Points</th>
                <th className={cellClass}>Repeat violations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((t) => (
                <tr key={t.id}>
                  <td className={cellClass}>
                    <span className="font-mono text-xs text-slate-900">
                      {t.vin ?? 'VIN not on file'}
                    </span>
                    {t.plates.length > 0 && (
                      <span className="block text-xs text-slate-500">
                        Plate {t.plates.join(', ')}
                      </span>
                    )}
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>{t.inspections}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{t.violations}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{t.outOfService}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    {Math.round(t.points * 10) / 10}
                  </td>
                  <td className={cellClass}>
                    {t.repeats.length === 0 ? (
                      <span className="text-slate-500">None</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs text-slate-700">
                        {t.repeats.map((r) => (
                          <li key={r.code}>
                            <span className="font-semibold text-slate-900">
                              {plainGroup(r.group) ?? r.description ?? r.code}
                            </span>{' '}
                            on {r.inspections} inspections
                            {plainGroup(r.group) && r.description ? ` · ${r.description}` : ''}{' '}
                            <span className="font-mono text-slate-500">({r.code})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </StackTable>
        </div>
      )}
      {trucks.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="min-h-11 text-sm font-medium text-accent-strong hover:underline"
        >
          {all ? 'Show fewer' : `Show all ${trucks.length} trucks`}
        </button>
      )}
      <p className="text-xs text-slate-500">
        Only Vehicle Maintenance violations FMCSA records on the power unit. Trailer and driver
        violations aren’t a truck’s.
        {unmatched > 0 &&
          ` ${unmatched} inspection${unmatched === 1 ? ' has' : 's have'} no VIN or plate on file, so ${unmatched === 1 ? 'it' : 'they'} can’t be matched to a truck.`}
      </p>
    </div>
  )
}
