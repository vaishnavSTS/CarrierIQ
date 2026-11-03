import { ChartCard } from '../../../components/charts/ChartCard'
import { SERIES } from '../../../components/charts/chartTheme'
import { ColumnChart } from '../../../components/charts/ColumnChart'
import type { SmsInspection } from '../../../types/carrierSafety'
import { rollOff } from '../packet/recordDetail'
import { cellClass, headClass, tableClass } from '../styles'

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' })
const LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

/** The violation points still counting each month if the carrier gets no new violations. */
export function RollOffChart({ inspections }: { inspections: SmsInspection[] }) {
  const months = rollOff(inspections)
  if (months[0].points === 0) return null
  const rounded = (points: number) => Math.round(points * 10) / 10
  return (
    <ChartCard
      title="Violation points still counting, if there are no new violations"
      subtitle="How serious each violation is × how recent it is, added up across all safety categories"
      note="These are weight points, not a percentile or a score: FMCSA's percentiles also depend on clean inspections and on other carriers, and crashes aren't included here. So this shows the direction, not a promised result."
      chart={
        <ColumnChart
          ariaLabel="Violation points still counting by month"
          color={SERIES.blue}
          data={months.map((m, i) => ({
            key: m.date.toISOString(),
            tick: i === 0 ? 'Now' : MONTH.format(m.date),
            title: i === 0 ? 'Now' : LONG.format(m.date),
            value: rounded(m.points),
            valueLabel: 'points',
          }))}
        />
      }
      table={
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr className={headClass}>
                <th className={cellClass}>Month</th>
                <th className={`${cellClass} text-right`}>Points still counting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {months.map((m, i) => (
                <tr key={m.date.toISOString()}>
                  <td className={cellClass}>{i === 0 ? 'Now' : LONG.format(m.date)}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{rounded(m.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    />
  )
}
