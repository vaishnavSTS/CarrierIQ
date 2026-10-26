import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { DataQsCaseSummary } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import { WORK_STATUS } from './labels'

/**
 * Phones: one case as a card you tap to open (wider screens use the tables). `children` adds
 * lines, e.g. STS's queue shows the owner, filing window, missing evidence and tasks.
 */
export function DataQsCaseCard({
  dataqsCase: c,
  to,
  showCompany,
  children,
}: {
  dataqsCase: DataQsCaseSummary
  to: string
  showCompany: boolean
  children?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-slate-200 bg-surface p-4 transition-colors hover:border-accent active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-600">
            Case {c.id}
            {showCompany &&
              (c.held_by_sts
                ? ' · Held by STS'
                : c.organization_name && ` · ${c.organization_name}`)}
          </div>
          <div className="truncate font-medium text-slate-900">{c.carrier_name ?? 'Carrier'}</div>
          <div className="text-xs text-slate-600">
            USDOT <span className="font-mono">{c.usdot_number}</span>
          </div>
        </div>
        <span className="shrink-0">
          <StatusBadge {...WORK_STATUS[c.work_status]} />
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-700">
        Inspection {formatDate(c.event_date)}
        {c.event_state && ` · ${c.event_state}`}
        <span className="font-mono text-xs text-slate-600">
          {' '}
          · {c.inspection_report_number ?? c.source_event_id}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-900">{c.next_action}</p>
      {children}
      <div className="mt-2 text-xs text-slate-600">Updated {formatDateTime(c.updated_at)}</div>
    </Link>
  )
}
