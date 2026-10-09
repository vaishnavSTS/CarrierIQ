import { ChartCard } from '../../../components/charts/ChartCard'
import { SERIES } from '../../../components/charts/chartTheme'
import { ColumnChart } from '../../../components/charts/ColumnChart'
import { LineChart } from '../../../components/charts/LineChart'
import type { Quarter } from '../../../types/carrierSafety'
import { formatPercent } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../styles'

/** "2025-Q3" -> "Q3 ’25"; the last quarter is the current one and still in progress. */
function tick(quarter: string, current: boolean): string {
  const [year, q] = quarter.split('-')
  return `${q} ’${year.slice(2)}${current ? '*' : ''}`
}

function title(quarter: string, current: boolean): string {
  const [year, q] = quarter.split('-')
  return `${q} ${year}${current ? ' (in progress)' : ''}`
}

function QuarterTable({ quarters }: { quarters: Quarter[] }) {
  return (
    <table className={tableClass}>
      <thead className={headClass}>
        <tr>
          <th className={cellClass}>Quarter</th>
          <th className={`${cellClass} text-right`}>Inspections</th>
          <th className={`${cellClass} text-right`}>Vehicle OOS</th>
          <th className={`${cellClass} text-right`}>Driver OOS</th>
          <th className={`${cellClass} text-right`}>Violations</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 tabular-nums">
        {[...quarters].reverse().map((q, i) => (
          <tr key={q.quarter}>
            <td className={cellClass}>{title(q.quarter, i === 0)}</td>
            <td className={`${cellClass} text-right`}>{q.inspections}</td>
            <td className={`${cellClass} text-right`}>
              {q.vehicle_oos}{' '}
              <span className="text-xs text-slate-500">({formatPercent(q.vehicle_oos_rate)})</span>
            </td>
            <td className={`${cellClass} text-right`}>
              {q.driver_oos}{' '}
              <span className="text-xs text-slate-500">({formatPercent(q.driver_oos_rate)})</span>
            </td>
            <td className={`${cellClass} text-right`}>{q.violations}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SafetyTrends({ quarters }: { quarters: Quarter[] }) {
  const last = quarters.length - 1
  const points = quarters.map((q, i) => ({
    tick: tick(q.quarter, i === last),
    title: title(q.quarter, i === last),
    details: [`${q.inspections} inspection${q.inspections === 1 ? '' : 's'}`],
  }))
  const note = '* Current quarter, still in progress. Quarters without inspections have no rate.'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Inspections per quarter"
        subtitle="Roadside inspections FMCSA recorded for the carrier each quarter"
        note={note}
        chart={
          <ColumnChart
            ariaLabel="Inspections per quarter"
            color={SERIES.blue}
            data={quarters.map((q, i) => ({
              key: q.quarter,
              tick: tick(q.quarter, i === last),
              title: title(q.quarter, i === last),
              value: q.inspections,
              valueLabel: q.inspections === 1 ? 'inspection' : 'inspections',
              details: [`${q.violations} violations recorded`],
            }))}
          />
        }
        table={<QuarterTable quarters={quarters} />}
      />
      <ChartCard
        title="Out-of-service rate per quarter"
        subtitle="FMCSA’s method: only inspections that examined the vehicle (or driver) count"
        note={`${note} The current quarter is shown as a separate dot, not joined to the trend.`}
        chart={
          <LineChart
            ariaLabel="Vehicle and driver out-of-service rate per quarter"
            detachFrom={last}
            points={points}
            format={(v) => formatPercent(v)}
            series={[
              {
                name: 'Vehicle',
                color: SERIES.blue,
                values: quarters.map((q) => q.vehicle_oos_rate),
              },
              {
                name: 'Driver',
                color: SERIES.orange,
                values: quarters.map((q) => q.driver_oos_rate),
              },
            ]}
          />
        }
        table={<QuarterTable quarters={quarters} />}
      />
    </div>
  )
}
