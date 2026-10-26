import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import { useMe } from '../../../hooks/useAuth'
import { useDataQsCases } from '../../../hooks/useDataQs'
import type { DataQsCaseSummary } from '../../../types/dataqs'
import { formatDate, formatDateTime } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../../carrier-profile/styles'
import { AgentAccessBadge } from '../DataQsAgentAccess'
import { DataQsCaseCard } from '../DataQsCaseCard'
import { WORK_STATUS } from '../labels'
import { useRowLink } from '../rowLink'

type Filter = 'sts' | 'mine' | 'unassigned' | 'carrier' | 'closed' | 'all'

const FILTERS: {
  id: Filter
  label: string
  test: (c: DataQsCaseSummary, me?: number) => boolean
}[] = [
  {
    id: 'sts',
    label: 'Needs STS',
    // Also a client waiting for STS to request FMCSA Portal access, whatever the stage.
    test: (c) => c.action_owner === 'STS' || c.agent_access === 'REQUESTED',
  },
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
              {f.label} <span className="text-xs text-slate-600">{count}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-surface p-5 text-sm text-slate-600">
          No cases here.
        </p>
      ) : (
        <>
          <ul className="space-y-3 sm:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <DataQsCaseCard dataqsCase={c} to={`/dataqs/cases/${c.id}`} showCompany>
                  <AgentAccessBadge status={c.agent_access} />
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-slate-600">Owner</dt>
                      <dd className="text-sm text-slate-900">{c.owner_name ?? 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Filing window</dt>
                      <dd className="text-sm">
                        <FilingWindow dataqsCase={c} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Missing evidence</dt>
                      <dd className="text-sm">
                        {c.evidence_gaps ? (
                          <span className="font-medium text-amber-700">
                            {c.evidence_gaps} {c.evidence_gaps === 1 ? 'issue' : 'issues'}
                          </span>
                        ) : (
                          <span className="text-slate-500">None</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Tasks</dt>
                      <dd className="text-sm text-slate-900">
                        {c.open_task_count || 'None'}
                        {c.overdue_task_count > 0 && (
                          <span className="ml-1 font-medium text-amber-700">
                            ({c.overdue_task_count} overdue)
                          </span>
                        )}
                      </dd>
                    </div>
                    {c.next_deadline_at && (
                      <div className="col-span-2">
                        <dt className="text-slate-600">
                          {c.next_deadline_label ?? 'Next deadline'}
                        </dt>
                        <dd className="text-sm text-slate-900">
                          {formatDateTime(c.next_deadline_at)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </DataQsCaseCard>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-surface sm:block">
            <table className={tableClass}>
              <thead className={headClass}>
                <tr>
                  <th className={head}>Case</th>
                  <th className={head}>Company · carrier</th>
                  <th className={head}>Inspection</th>
                  <th className={head}>Status</th>
                  <th className={head}>Owner</th>
                  <th className={head}>Next deadline</th>
                  <th
                    className={head}
                    title="Time left to file in DataQs (3 years from the inspection)"
                  >
                    Filing window
                  </th>
                  <th className={head} title="Issues with no evidence attached">
                    Missing evidence
                  </th>
                  <th className={head}>Tasks</th>
                  <th className={head}>Updated</th>
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
                        {c.id}
                      </Link>
                    </td>
                    <td className={cellClass}>
                      <Link
                        to={`/dataqs/cases/${c.id}`}
                        className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                      >
                        {c.held_by_sts ? 'Held by STS' : (c.organization_name ?? 'Case')}
                      </Link>
                      <div className="text-xs text-slate-600">
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
                      <AgentAccessBadge status={c.agent_access} />
                      <div className="mt-0.5 text-xs text-slate-600">{c.next_action}</div>
                      {c.gov_request_id && (
                        <div className="font-mono text-xs text-slate-600">{c.gov_request_id}</div>
                      )}
                    </td>
                    <td className={cellClass}>
                      {c.owner_name ?? <span className="text-slate-500">—</span>}
                    </td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {c.next_deadline_at ? (
                        <>
                          {formatDateTime(c.next_deadline_at)}
                          <div className="text-xs text-slate-600">{c.next_deadline_label}</div>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className={`${cellClass} whitespace-nowrap tabular-nums`}>
                      <FilingWindow dataqsCase={c} />
                    </td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {c.evidence_gaps ? (
                        <span className="font-medium text-amber-700">
                          {c.evidence_gaps} {c.evidence_gaps === 1 ? 'issue' : 'issues'}
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
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
        </>
      )}
    </div>
  )
}

const head = `${cellClass} whitespace-nowrap`

/** Days left to file: amber within 30 days, red within 7 or once passed. Filed cases are done
 * with it. */
function FilingWindow({ dataqsCase: c }: { dataqsCase: DataQsCaseSummary }) {
  const left = c.window_days_left
  if (c.gov_request_id) return <span className="text-slate-400">Filed</span>
  if (left === null) return <span className="text-slate-400">Unknown</span>
  if (left < 0) return <span className="font-medium text-red-700">Passed</span>
  const tone =
    left <= 7 ? 'font-medium text-red-700' : left <= 30 ? 'font-medium text-amber-700' : ''
  return (
    <span className={tone}>
      {left} {left === 1 ? 'day' : 'days'} left
    </span>
  )
}
