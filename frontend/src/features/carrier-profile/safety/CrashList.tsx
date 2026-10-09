import type { CrashSummary } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { Empty } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

/** Crashes FMCSA's Crash File lists for the carrier, newest first. */
export function CrashList({ crashes }: { crashes: CrashSummary | null }) {
  if (crashes === null) {
    return <Empty>FMCSA’s crash reports have not been fetched yet; use Refresh now.</Empty>
  }
  if (crashes.total === 0) {
    return <Empty>FMCSA’s Crash File lists no crashes in the last {crashes.years} years.</Empty>
  }
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        FMCSA Crash File · last {crashes.years} years: {crashes.total} crash
        {crashes.total === 1 ? '' : 'es'}, {crashes.fatal} with a fatality, {crashes.injury} with an
        injury. Reported crashes are not a finding of fault; FMCSA’s file does not say who caused
        them.
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={cellClass}>Date</th>
              <th className={cellClass}>Where</th>
              <th className={`${cellClass} text-right`}>Fatalities</th>
              <th className={`${cellClass} text-right`}>Injuries</th>
              <th className={cellClass}>Tow-away</th>
              <th className={cellClass}>Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {crashes.crashes.map((c) => (
              <tr key={c.report_number}>
                <td className={`${cellClass} whitespace-nowrap`}>{formatDate(c.report_date)}</td>
                <td className={cellClass}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                <td
                  className={`${cellClass} text-right ${c.fatalities ? 'font-medium text-red-700' : ''}`}
                >
                  {c.fatalities}
                </td>
                <td className={`${cellClass} text-right`}>{c.injuries}</td>
                <td className={cellClass}>{c.tow_away ? 'Yes' : 'No'}</td>
                <td className={`${cellClass} font-mono text-xs text-slate-500`}>
                  {c.report_number}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {crashes.total > crashes.crashes.length && (
        <p className="mt-2 text-xs text-slate-500">
          Showing the {crashes.crashes.length} most recent of {crashes.total}.
        </p>
      )}
    </div>
  )
}
