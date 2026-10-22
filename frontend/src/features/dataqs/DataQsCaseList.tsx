import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useDataQsCasePath, useDataQsCases } from '../../hooks/useDataQs'
import { formatDate, formatDateTime } from '../../utils/format'
import { cellClass, headClass, tableClass } from '../carrier-profile/styles'
import { WORK_STATUS } from './labels'
import { useRowLink } from './rowLink'

/** DataQs cases the user may see, newest first. Staff also see each case's company. */
export function DataQsCaseList({ showCompany, empty }: { showCompany: boolean; empty: string }) {
  const { data, isPending, error } = useDataQsCases()
  const casePath = useDataQsCasePath()
  const rowLink = useRowLink()

  if (isPending) return <p className="text-sm text-slate-500">Loading cases…</p>
  if (error) return <p className="text-sm text-red-700">Could not load cases: {error.message}</p>
  if (data.cases.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-surface p-5 text-sm text-slate-600">
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Case</th>
            {showCompany && <th className={cellClass}>Company</th>}
            <th className={cellClass}>Carrier</th>
            <th className={cellClass}>Inspection</th>
            <th className={cellClass}>Status</th>
            <th className={cellClass}>Next step</th>
            <th className={cellClass}>Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.cases.map((c) => (
            <tr key={c.id} {...rowLink(casePath(c.id))}>
              <td className={cellClass}>
                <Link
                  to={casePath(c.id)}
                  className="font-medium text-accent-strong hover:underline"
                >
                  #{c.id}
                </Link>
              </td>
              {showCompany && <td className={cellClass}>{c.organization_name ?? '—'}</td>}
              <td className={cellClass}>
                <Link
                  to={casePath(c.id)}
                  className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                >
                  {c.carrier_name ?? 'Case'}
                </Link>
                <div className="text-xs text-slate-500">
                  USDOT <span className="font-mono">{c.usdot_number}</span>
                </div>
              </td>
              <td className={cellClass}>
                <div className="whitespace-nowrap">
                  {formatDate(c.event_date)}
                  {c.event_state && ` · ${c.event_state}`}
                </div>
                <div className="font-mono text-xs text-slate-500">{c.source_event_id}</div>
              </td>
              <td className={cellClass}>
                <StatusBadge {...WORK_STATUS[c.work_status]} />
              </td>
              <td className={`${cellClass} text-slate-700`}>{c.next_action}</td>
              <td className={`${cellClass} whitespace-nowrap text-slate-500`}>
                {formatDateTime(c.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
