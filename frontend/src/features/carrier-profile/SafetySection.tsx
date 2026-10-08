import { StatusBadge } from '../../components/StatusBadge'
import type { Safety } from '../../types/carrierProfile'
import { formatDate, formatPercent } from '../../utils/format'
import { Empty, Section, Stat } from './Section'
import { cellClass, headClass, tableClass } from './styles'

const RATING_TONE: Record<string, 'ok' | 'warn' | 'down'> = {
  SATISFACTORY: 'ok',
  CONDITIONAL: 'warn',
  UNSATISFACTORY: 'down',
}

function OosFlag({ value }: { value: boolean }) {
  return value ? <StatusBadge label="OOS" tone="down" /> : <span className="text-slate-400">—</span>
}

export function SafetySection({ safety }: { safety: Safety }) {
  return (
    <Section id="safety" title="Safety">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Inspections"
          value={safety.inspection_count}
          note={
            safety.first_inspection_date
              ? `${formatDate(safety.first_inspection_date)} – ${formatDate(safety.last_inspection_date)}`
              : 'None in FMCSA’s current window'
          }
        />
        <Stat
          label="Vehicle OOS"
          value={formatPercent(safety.vehicle_oos_rate)}
          note={`${safety.vehicle_oos_count} of ${safety.inspection_count} inspections`}
        />
        <Stat
          label="Driver OOS"
          value={formatPercent(safety.driver_oos_rate)}
          note={`${safety.driver_oos_count} of ${safety.inspection_count} inspections`}
        />
        <Stat label="Crashes" value={safety.crash_count ?? '—'} note="Crash data not loaded yet" />
        <Stat
          label="Safety rating"
          value={
            safety.safety_rating ? (
              <StatusBadge
                label={safety.safety_rating}
                tone={RATING_TONE[safety.safety_rating] ?? 'neutral'}
              />
            ) : (
              <span className="text-sm font-normal text-slate-500">Not rated</span>
            )
          }
          note={
            safety.safety_rating_date ? `Since ${formatDate(safety.safety_rating_date)}` : undefined
          }
        />
      </div>

      {safety.inspection_count === 0 ? (
        <div className="mt-4">
          <Empty>
            No inspections in FMCSA’s current inspection file (roughly the last three years).
          </Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              By year
            </h3>
            <table className={tableClass}>
              <thead className={headClass}>
                <tr>
                  <th className={cellClass}>Year</th>
                  <th className={`${cellClass} text-right`}>Inspections</th>
                  <th className={`${cellClass} text-right`}>Vehicle OOS</th>
                  <th className={`${cellClass} text-right`}>Driver OOS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {safety.by_year.map((y) => (
                  <tr key={y.year}>
                    <td className={cellClass}>{y.year}</td>
                    <td className={`${cellClass} text-right`}>{y.inspections}</td>
                    <td className={`${cellClass} text-right`}>
                      {y.vehicle_oos}{' '}
                      <span className="text-xs text-slate-500">
                        ({formatPercent(y.vehicle_oos / y.inspections)})
                      </span>
                    </td>
                    <td className={`${cellClass} text-right`}>
                      {y.driver_oos}{' '}
                      <span className="text-xs text-slate-500">
                        ({formatPercent(y.driver_oos / y.inspections)})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto lg:col-span-2">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Recent inspections
            </h3>
            <table className={tableClass}>
              <thead className={headClass}>
                <tr>
                  <th className={cellClass}>Date</th>
                  <th className={cellClass}>Level</th>
                  <th className={cellClass}>Location</th>
                  <th className={cellClass}>VIN</th>
                  <th className={`${cellClass} text-right`}>Violations</th>
                  <th className={cellClass}>Vehicle</th>
                  <th className={cellClass}>Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safety.recent_inspections.map((i) => (
                  <tr key={i.inspection_id}>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {formatDate(i.inspection_date)}
                    </td>
                    <td className={cellClass}>{i.level ?? '—'}</td>
                    <td className={cellClass}>{i.location ?? i.state ?? '—'}</td>
                    <td className={`${cellClass} font-mono text-xs`}>{i.vin ?? '—'}</td>
                    <td className={`${cellClass} text-right tabular-nums`}>{i.violations}</td>
                    <td className={cellClass}>
                      <OosFlag value={i.vehicle_oos} />
                    </td>
                    <td className={cellClass}>
                      <OosFlag value={i.driver_oos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  )
}
