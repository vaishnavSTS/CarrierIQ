import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useInvoices } from '../../hooks/useInvoices'
import { usePortalMode } from '../../hooks/usePortalMode'
import { formatDateTime } from '../../utils/format'
import { cellClass, headClass, tableClass } from '../carrier-profile/styles'
import { Empty, Section } from '../carrier-profile/Section'
import { INVOICE_STATUS } from './status'

/**
 * The carrier profile's Invoices tab: invoices for this carrier, newest first, with the date each
 * was generated (services and the client's subscription). Clients see their own company's; STS
 * staff see every company's. Brokers (no `usdotNumber`): their own brokerage's subscription ones.
 */
export function CarrierInvoicesSection({
  usdotNumber,
  empty = 'No invoices for this carrier yet. Paying for a service on the Compliance tab or the subscription creates one.',
}: {
  usdotNumber: number | null
  empty?: string
}) {
  const mode = usePortalMode()
  const staff = mode === 'internal'
  const base = staff ? '' : mode === 'broker' ? '/broker' : '/portal'
  const { data, isPending, error } = useInvoices(null, usdotNumber)
  const invoices = data?.invoices ?? []

  return (
    <Section
      id="invoices"
      title="Invoices"
      source="CarrierSafetyScan invoices, paid through Stripe"
    >
      {isPending ? (
        <p className="text-sm text-slate-500">Loading invoices…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load invoices: {error.message}</p>
      ) : invoices.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Invoice</th>
                <th className={cellClass}>Date generated</th>
                {staff && <th className={cellClass}>Client</th>}
                <th className={`${cellClass} text-right`}>Total</th>
                <th className={cellClass}>Status</th>
                <th className={cellClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100">
                  <td className={cellClass}>
                    <Link
                      to={`${base}/invoices/${inv.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDateTime(inv.issued_at)}
                  </td>
                  {staff && <td className={cellClass}>{inv.organization_name ?? '—'}</td>}
                  <td className={`${cellClass} text-right tabular-nums`}>
                    ${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge {...INVOICE_STATUS[inv.status]} />
                    {inv.paid_at && (
                      <div className="text-xs text-slate-600">
                        Paid {formatDateTime(inv.paid_at)}
                      </div>
                    )}
                  </td>
                  <td className={`${cellClass} text-right`}>
                    <Link
                      to={`${base}/invoices/${inv.id}`}
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
    </Section>
  )
}
