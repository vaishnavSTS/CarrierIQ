import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import { dataQsAuditExportUrl } from '../../../api/dataqs'
import { useDataQsSupervisor } from '../../../hooks/useDataQs'
import type { DataQsException, DataQsWorkload } from '../../../types/dataqs'
import { formatDate, formatDateTime } from '../../../utils/format'
import type { Tone } from '../../../utils/status'
import { cellClass, headClass, tableClass } from '../../carrier-profile/styles'
import { inputClass, labelClass } from '../intake/intakeState'
import { WORK_STATUS } from '../labels'
import { secondaryButton } from '../ui'

const SEVERITY: Record<DataQsException['severity'], { label: string; tone: Tone }> = {
  HIGH: { label: 'Urgent', tone: 'down' },
  MEDIUM: { label: 'Attention', tone: 'warn' },
  LOW: { label: 'Check', tone: 'pending' },
}

type Filter = 'all' | DataQsException['severity']

/**
 * STS admins: everything across all DataQs cases that needs attention (late or near deadlines,
 * unassigned or stale cases, unconfirmed filings, failed emails), each specialist's workload,
 * and the audit trail as a spreadsheet.
 */
export function DataQsSupervisorView() {
  const { data, isPending, error } = useDataQsSupervisor()
  const [filter, setFilter] = useState<Filter>('all')

  if (isPending) return <p className="text-sm text-slate-500">Loading the supervisor view…</p>
  if (error) return <p className="text-sm text-red-700">Could not load: {error.message}</p>

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const e of data.exceptions) counts[e.severity] += 1
  const shown = data.exceptions.filter((e) => filter === 'all' || e.severity === filter)

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Needs attention</h2>
          <p className="text-xs text-slate-500">
            Updated {formatDateTime(data.generated_at)} · refreshes every minute
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label="Filter by urgency">
          {(['all', 'HIGH', 'MEDIUM', 'LOW'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 ${
                filter === f
                  ? 'bg-accent-soft font-medium text-accent-strong'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All' : SEVERITY[f].label}{' '}
              <span className="text-xs text-slate-500">
                {f === 'all' ? data.exceptions.length : counts[f]}
              </span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            {data.exceptions.length === 0
              ? 'Nothing needs attention: every open case has an owner, no deadline is late and no email has failed.'
              : 'Nothing at this level.'}
          </p>
        ) : (
          <ExceptionTable rows={shown} />
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Workload</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Open cases sent to STS (not drafts, not closed) by case specialist.
          </p>
        </div>
        <WorkloadTable rows={data.workload} />
      </section>

      <AuditExport />
    </div>
  )
}

function ExceptionTable({ rows }: { rows: DataQsException[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Urgency</th>
            <th className={cellClass}>What</th>
            <th className={cellClass}>Case</th>
            <th className={cellClass}>Owner</th>
            <th className={cellClass}>When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((e, i) => (
            <tr key={`${e.case_id}-${e.kind}-${i}`} className="align-top hover:bg-slate-50">
              <td className={cellClass}>
                <StatusBadge {...SEVERITY[e.severity]} />
              </td>
              <td className={cellClass}>
                <div className="font-medium text-slate-900">{e.title}</div>
                <div className="text-xs text-slate-600">{e.detail}</div>
              </td>
              <td className={`${cellClass} whitespace-nowrap`}>
                <Link
                  to={`/dataqs/cases/${e.case_id}`}
                  className="font-medium text-accent-strong hover:underline"
                >
                  Case {e.case_id}
                </Link>
                <div className="text-xs text-slate-500">
                  {e.organization_name ?? '—'} · USDOT{' '}
                  <span className="font-mono">{e.usdot_number}</span>
                </div>
                <div className="text-xs text-slate-500">{WORK_STATUS[e.work_status].label}</div>
              </td>
              <td className={cellClass}>
                {e.owner_name ?? <span className="text-amber-700">Unassigned</span>}
              </td>
              <td className={`${cellClass} whitespace-nowrap text-slate-600`}>
                {/* A filing window ends on a day, not at a time */}
                {!e.at
                  ? '—'
                  : e.kind.startsWith('WINDOW_')
                    ? formatDate(e.at.slice(0, 10))
                    : formatDateTime(e.at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WorkloadTable({ rows }: { rows: DataQsWorkload[] }) {
  const number = (n: number, warn = false) =>
    n === 0 ? (
      <span className="text-slate-400">0</span>
    ) : (
      <span className={warn ? 'font-medium text-red-700' : ''}>{n}</span>
    )
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Specialist</th>
            <th className={`${cellClass} text-right`}>Open cases</th>
            <th className={`${cellClass} text-right`}>Needs STS</th>
            <th className={`${cellClass} text-right`}>Waiting on carrier</th>
            <th className={`${cellClass} text-right`}>With the agency</th>
            <th className={`${cellClass} text-right`}>Overdue tasks</th>
            <th className={`${cellClass} text-right`}>Late deadlines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((w) => (
            <tr key={w.owner_id ?? 'unassigned'}>
              <td className={cellClass}>
                {w.owner_id === null ? (
                  <span className="font-medium text-amber-700">Unassigned</span>
                ) : (
                  (w.owner_name ?? `User ${w.owner_id}`)
                )}
              </td>
              <td className={`${cellClass} text-right`}>{number(w.active_cases)}</td>
              <td className={`${cellClass} text-right`}>{number(w.needs_sts)}</td>
              <td className={`${cellClass} text-right`}>{number(w.waiting_carrier)}</td>
              <td className={`${cellClass} text-right`}>{number(w.waiting_agency)}</td>
              <td className={`${cellClass} text-right`}>{number(w.overdue_tasks, true)}</td>
              <td className={`${cellClass} text-right`}>{number(w.overdue_deadlines, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function AuditExport() {
  const today = new Date()
  const [since, setSince] = useState(isoDay(new Date(today.getTime() - 90 * 86_400_000)))
  const [until, setUntil] = useState(isoDay(today))
  const valid = since !== '' && until !== '' && since <= until

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Audit export</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Every recorded action on every DataQs case (who, what, when, before and after), as a
          spreadsheet (CSV). Up to a year at a time; dates are UTC.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-since" className={labelClass}>
            From
          </label>
          <input
            id="audit-since"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="audit-until" className={labelClass}>
            To
          </label>
          <input
            id="audit-until"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={inputClass}
          />
        </div>
        {valid ? (
          <a href={dataQsAuditExportUrl(since, until)} className={secondaryButton} download>
            Download CSV
          </a>
        ) : (
          <span className="text-sm text-red-700">The start date must be before the end date.</span>
        )}
      </div>
    </section>
  )
}
