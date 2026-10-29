import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import { cellClass, headClass, tableClass } from '../features/carrier-profile/styles'
import { INVOICE_STATUS } from '../features/invoices/status'
import { useInvoices } from '../hooks/useInvoices'
import type { InvoiceStatus } from '../types/invoice'
import { formatDateTime } from '../utils/format'

const FILTERS: [InvoiceStatus | null, string][] = [
  [null, 'All'],
  ['UNPAID', 'Unpaid'],
  ['PAID', 'Paid'],
  ['VOID', 'Void'],
  ['REFUNDED', 'Refunded'],
]

/** STS staff: every CarrierSafetyScan invoice (paid through Stripe), newest first. */
export function InvoicesPage() {
  const [filter, setFilter] = useState<InvoiceStatus | null>(null)
  const { data, isPending, error } = useInvoices(filter)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-slate-600">
          Created when a client pays for a service on the Compliance tab, and paid through Stripe.
          Refunds are made in Stripe and show here on their own.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label="Filter invoices">
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
        <p className="text-sm text-slate-500">Loading invoices…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load invoices: {error.message}</p>
      ) : data.invoices.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">
          No invoices here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Invoice</th>
                <th className={cellClass}>Date</th>
                <th className={cellClass}>Billed to</th>
                <th className={cellClass}>Client</th>
                <th className={`${cellClass} text-right`}>Total</th>
                <th className={cellClass}>Status</th>
                <th className={cellClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className={cellClass}>
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDateTime(inv.issued_at)}
                  </td>
                  <td className={cellClass}>
                    <div className="text-slate-900">{inv.billed_to}</div>
                    {inv.usdot_number !== null && (
                      <Link
                        to={`/carriers/${inv.usdot_number}`}
                        className="font-mono text-xs text-slate-600 hover:underline"
                      >
                        USDOT {inv.usdot_number}
                      </Link>
                    )}
                  </td>
                  <td className={cellClass}>{inv.organization_name ?? '—'}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    ${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge {...INVOICE_STATUS[inv.status]} />
                    {inv.paid_at && (
                      <div className="text-xs text-slate-600">{formatDateTime(inv.paid_at)}</div>
                    )}
                  </td>
                  <td className={`${cellClass} text-right`}>
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                    >
                      View invoice
                    </Link>
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
