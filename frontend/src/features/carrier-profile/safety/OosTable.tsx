import type { OosWindow } from '../../../types/carrierProfile'
import { formatPercent } from '../../../utils/format'
import { Empty } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

/** "Above by 17.3 points" / "Below by 4.0 points" / "Same" against FMCSA's national average. */
function versus(rate: number | null, national: number): string {
  if (rate === null) return '—'
  const points = Math.abs(rate - national) * 100
  if (points < 0.05) return 'Same'
  return `${rate > national ? 'Above' : 'Below'} by ${points.toFixed(1)} points`
}

/**
 * The carrier's out-of-service rates next to FMCSA's national averages, laid out like FMCSA's
 * SAFER snapshot: the one place on the Safety tab that compares the two.
 */
export function OosTable({ recent }: { recent: OosWindow | null }) {
  if (!recent) {
    return <Empty>No roadside inspections in the last 24 months, so no out-of-service rates.</Empty>
  }
  const rows = [
    [
      'Vehicle',
      recent.vehicle_inspections,
      recent.vehicle_oos,
      recent.vehicle_oos_rate,
      recent.national_vehicle_oos_rate,
    ],
    [
      'Driver',
      recent.driver_inspections,
      recent.driver_oos,
      recent.driver_oos_rate,
      recent.national_driver_oos_rate,
    ],
  ] as const

  return (
    <div>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={cellClass}>Last {recent.months} months</th>
              <th className={`${cellClass} text-right`}>Inspections that examined it</th>
              <th className={`${cellClass} text-right`}>Out of service</th>
              <th className={`${cellClass} text-right`}>Out-of-service rate</th>
              <th className={`${cellClass} text-right`}>FMCSA national average</th>
              <th className={`${cellClass} text-right`}>Compared with national</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {rows.map(([unit, base, oos, rate, national]) => (
              <tr key={unit}>
                <td className={`${cellClass} font-medium text-slate-900`}>{unit}</td>
                <td className={`${cellClass} text-right`}>{base}</td>
                <td className={`${cellClass} text-right`}>{oos}</td>
                <td className={`${cellClass} text-right font-semibold text-slate-900`}>
                  {formatPercent(rate)}
                </td>
                <td className={`${cellClass} text-right`}>{formatPercent(national)}</td>
                <td className={`${cellClass} text-right`}>{versus(rate, national)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        FMCSA’s method: the vehicle rate counts only inspections that examined the vehicle (Levels
        I, II, V, VI) and the driver rate only those that examined the driver (Levels I, II, III,
        VI). {recent.inspections} inspections in all in the last {recent.months} months.
        {(recent.vehicle_inspections < 5 || recent.driver_inspections < 5) &&
          ' Rates based on fewer than 5 inspections can swing a lot with one result.'}
      </p>
    </div>
  )
}
