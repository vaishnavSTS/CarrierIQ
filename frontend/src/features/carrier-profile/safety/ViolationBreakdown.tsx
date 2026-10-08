import { SERIES } from '../../../components/charts/chartTheme'
import type { ViolationSummary } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../styles'

function partLabel(part: number | null, title: string | null): string {
  if (part === null) return 'Regulation not given'
  return title ? `Part ${part} · ${title}` : `Part ${part}`
}

export function ViolationBreakdown({ summary }: { summary: ViolationSummary }) {
  if (summary.total === 0) {
    return <p className="text-sm text-slate-500">No violations recorded on these inspections.</p>
  }
  const max = Math.max(...summary.by_part.map((p) => p.violations))

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{summary.total.toLocaleString()}</span> violations —{' '}
        {summary.vehicle.toLocaleString()} vehicle, {summary.driver.toLocaleString()} driver;{' '}
        <span className="font-semibold">{summary.out_of_service.toLocaleString()}</span> placed a
        vehicle or driver out of service.
        {summary.header_total !== summary.total && (
          <span className="block text-xs text-slate-500">
            The inspection reports count {summary.header_total.toLocaleString()}; FMCSA’s violation
            file has details for {summary.total.toLocaleString()} of them.
          </span>
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            By regulation (49 CFR)
          </h3>
          <ul className="space-y-2">
            {summary.by_part.map((p) => (
              <li key={p.part ?? 'none'} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-700">{partLabel(p.part, p.title)}</span>
                  <span className="whitespace-nowrap text-slate-500 tabular-nums">
                    <span className="font-semibold text-slate-900">{p.violations}</span>
                    {p.out_of_service > 0 && ` · ${p.out_of_service} OOS`}
                  </span>
                </div>
                <div className="mt-1 h-3 rounded-r bg-slate-100">
                  <div
                    className="h-3 rounded-r"
                    style={{
                      width: `${(p.violations / max) * 100}%`,
                      backgroundColor: SERIES.blue,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-x-auto">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Most frequent violations
          </h3>
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Violation</th>
                <th className={`${cellClass} text-right`}>Count</th>
                <th className={`${cellClass} text-right`}>OOS</th>
                <th className={cellClass}>Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.top_codes.map((c) => (
                <tr key={c.code ?? 'none'} className="align-top">
                  <td className={cellClass}>
                    <div className="text-slate-900">{c.description ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-500">{c.code}</div>
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>{c.violations}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{c.out_of_service}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(c.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
