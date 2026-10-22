import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import { useMe } from '../../../hooks/useAuth'
import { useDataQsCases } from '../../../hooks/useDataQs'
import type { DataQsCaseSummary } from '../../../types/dataqs'
import { formatDate, formatDateTime } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../../carrier-profile/styles'
import { WORK_STATUS } from '../labels'
import { useRowLink } from '../rowLink'

type Filter = 'sts' | 'mine' | 'unassigned' | 'carrier' | 'closed' | 'all'

const FILTERS: {
  id: Filter
  label: string
  test: (c: DataQsCaseSummary, me?: number) => boolean
}[] = [
  { id: 'sts', label: 'Needs STS', test: (c) => c.action_owner === 'STS' },
  { id: 'mine', label: 'Mine', test: (c, me) => c.owner_id === me && c.work_status !== 'CLOSED' },
  {
    id: 'unassigned',
    label: 'Unassigned',
    test: (c) => c.owner_id === null && c.work_status !== 'CLOSED' && c.work_status !== 'DRAFT',
  },
  { id: 'carrier', label: 'Waiting on carrier', test: (c) => c.action_owner === 'CARRIER' },
  { id: 'closed', label: 'Closed', test: (c) => c.work_status === 'CLOSED' },
  { id: 'all', label: 'All', test: () => true },
]

/** Most urgent first: overdue work, then the fewest days left in the review window. */
function urgency(c: DataQsCaseSummary): number {
  const deadline = c.next_deadline_at
    ? (new Date(c.next_deadline_at).getTime() - Date.now()) / 86_400_000
    : (c.window_days_left ?? 100_000)
  return (c.overdue_task_count > 0 ? -100_000 : 0) + deadline
}

/** STS work queue: owner, urgency, overdue work and evidence gaps. */
export function DataQsStaffQueue() {
  const [filter, setFilter] = useState<Filter>('sts')
  const { data: me } = useMe()
  const { data, isPending, error } = useDataQsCases()
  const rowLink = useRowLink()

  if (isPending) return <p className="text-sm text-slate-500">Loading cases…</p>
  if (error) return <p className="text-sm text-red-700">Could not load cases: {error.message}</p>

  const active = FILTERS.find((f) => f.id === filter)!
  const rows = data.cases
    .filter((c) => active.test(c, me?.id))
    .sort((a, b) => urgency(a) - urgency(b))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label="Filter cases">
        {FILTERS.map((f) => {
          const count = data.cases.filter((c) => f.test(c, me?.id)).length
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 ${
                filter === f.id
                  ? 'bg-accent-soft font-medium text-accent-strong'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className="text-xs text-slate-500">{count}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-surface p-5 text-sm text-slate-600">
          No cases here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Case</th>
                <th className={cellClass}>Company · carrier</th>
                <th className={cellClass}>Inspection</th>
                <th className={cellClass}>Status</th>
                <th className={cellClass}>Owner</th>
                <th className={cellClass}>Next deadline</th>
                <th className={`${cellClass} text-right`}>Window</th>
                <th className={`${cellClass} text-right`}>Evidence gaps</th>
                <th className={cellClass}>Tasks</th>
                <th className={cellClass}>Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} {...rowLink(`/dataqs/cases/${c.id}`)}>
                  <td className={cellClass}>
                    <Link
                      to={`/dataqs/cases/${c.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      #{c.id}
                    </Link>
                  </td>
                  <td className={cellClass}>
                    <Link
                      to={`/dataqs/cases/${c.id}`}
                      className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                    >
                      {c.organization_name ?? 'Case'}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c.carrier_name ?? '—'} · USDOT{' '}
                      <span className="font-mono">{c.usdot_number}</span>
                    </div>
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDate(c.event_date)}
                    {c.event_state && ` · ${c.event_state}`}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge {...WORK_STATUS[c.work_status]} />
                    <div className="mt-0.5 text-xs text-slate-500">{c.next_action}</div>
                    {c.gov_request_id && (
                      <div className="font-mono text-xs text-slate-500">{c.gov_request_id}</div>
                    )}
                  </td>
                  <td className={cellClass}>
                    {c.owner_name ?? <span className="text-slate-500">—</span>}
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {c.next_deadline_at ? (
                      <>
                        {formatDateTime(c.next_deadline_at)}
                        <div className="text-xs text-slate-500">{c.next_deadline_label}</div>
                      </>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    {c.window_days_left === null
                      ? '—'
                      : c.window_days_left < 0
                        ? 'Passed'
                        : `${c.window_days_left} d`}
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    {c.evidence_gaps || '—'}
                  </td>
                  <td className={cellClass}>
                    {c.open_task_count || '—'}
                    {c.overdue_task_count > 0 && (
                      <span className="ml-2">
                        <StatusBadge label={`${c.overdue_task_count} overdue`} tone="warn" />
                      </span>
                    )}
                  </td>
                  <td className={`${cellClass} whitespace-nowrap text-slate-500`}>
                    {formatDateTime(c.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
