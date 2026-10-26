import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import { cellClass, headClass, tableClass } from '../features/carrier-profile/styles'
import { useAllComplianceRequests, useMarkRequestHandled } from '../hooks/useCompliance'
import { formatDateTime } from '../utils/format'

type Filter = 'OPEN' | 'HANDLED' | null

const FILTERS: [Filter, string][] = [
  ['OPEN', 'Open'],
  ['HANDLED', 'Handled'],
  [null, 'All'],
]

/** STS staff: clients' requests for help from the Compliance tab, newest first. */
export function ServiceRequestsPage() {
  const [filter, setFilter] = useState<Filter>('OPEN')
  const { data, isPending, error } = useAllComplianceRequests(filter)
  const handled = useMarkRequestHandled()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Service requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Clients asking STS for help from a carrier’s Compliance tab. Each one is also emailed to
          STS. Follow up with the client, then mark it handled.
        </p>
      </div>
      <div className="flex gap-1 text-sm" role="tablist" aria-label="Filter requests">
        {FILTERS.map(([id, label]) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`rounded-md px-3 py-1.5 ${
              filter === id
                ? 'bg-accent-soft font-medium text-accent-strong'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading requests…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load requests: {error.message}</p>
      ) : data.requests.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">
          No requests here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={headClass}>Asked</th>
                <th className={headClass}>Service</th>
                <th className={headClass}>Carrier</th>
                <th className={headClass}>Client</th>
                <th className={headClass}>Note</th>
                <th className={headClass}>Status</th>
                <th className={headClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className={cellClass}>
                    <div className="font-medium text-slate-900">{r.service_label}</div>
                    {r.email_error && (
                      <div className="text-xs text-red-700">
                        STS email not sent: {r.email_error}
                      </div>
                    )}
                  </td>
                  <td className={cellClass}>
                    <Link
                      to={`/carriers/${r.usdot_number}?tab=compliance`}
                      className="font-mono text-accent-strong hover:underline"
                    >
                      {r.usdot_number}
                    </Link>
                  </td>
                  <td className={cellClass}>
                    <div className="font-medium text-slate-900">{r.organization_name ?? '—'}</div>
                    <div className="text-xs text-slate-600">
                      {r.requested_by_name}
                      {r.requested_by_email && (
                        <>
                          {' · '}
                          <a href={`mailto:${r.requested_by_email}`} className="hover:underline">
                            {r.requested_by_email}
                          </a>
                        </>
                      )}
                      {r.requested_by_phone && (
                        <>
                          {' · '}
                          <a href={`tel:${r.requested_by_phone}`} className="hover:underline">
                            {r.requested_by_phone}
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                  <td className={`${cellClass} max-w-xs whitespace-pre-line text-slate-700`}>
                    {r.note ?? '—'}
                  </td>
                  <td className={cellClass}>
                    {r.status === 'OPEN' ? (
                      <StatusBadge label="Open" tone="warn" />
                    ) : (
                      <div>
                        <StatusBadge label="Handled" tone="ok" />
                        <div className="mt-1 text-xs text-slate-600">
                          {r.handled_by_name}
                          {r.handled_at && ` · ${formatDateTime(r.handled_at)}`}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={cellClass}>
                    {r.status === 'OPEN' && (
                      <button
                        type="button"
                        disabled={handled.isPending}
                        onClick={() => handled.mutate(r.id)}
                        className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-accent-strong ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Mark handled
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {handled.isError && (
        <p className="text-sm text-red-700" role="alert">
          Could not update: {handled.error.message}
        </p>
      )}
    </div>
  )
}
