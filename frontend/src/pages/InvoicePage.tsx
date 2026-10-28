import { ArrowLeft, CreditCard, Download } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { InvoiceDocument } from '../features/invoices/InvoiceDocument'
import { usePortalMode } from '../hooks/usePortalMode'
import { openInTab, useInvoice, usePayInvoice, useVoidInvoice } from '../hooks/useInvoices'

const button =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium sm:min-h-0'

/** One invoice (client portal and STS): the document, Download PDF, and Pay now or Void. */
export function InvoicePage() {
  const id = Number(useParams().invoiceId)
  const [params] = useSearchParams()
  const backFromStripe = params.get('paid') === '1'
  const mode = usePortalMode()
  const staff = mode === 'internal'
  const { data: inv, isPending, error } = useInvoice(id, backFromStripe)
  const pay = usePayInvoice()
  const voiding = useVoidInvoice()
  const [confirmVoid, setConfirmVoid] = useState(false)

  if (isPending) return <p className="text-sm text-slate-500">Loading the invoice…</p>
  if (error) return <p className="text-sm text-red-700">Could not load it: {error.message}</p>

  const startPayment = () => {
    const tab = window.open('', '_blank')
    pay.mutate(inv.id, {
      onSuccess: ({ url }) => openInTab(tab, url),
      onError: () => tab?.close(),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={
            staff
              ? '/invoices'
              : mode === 'broker'
                ? '/broker/invoices'
                : inv.usdot_number !== null
                  ? `/portal/carriers/${inv.usdot_number}?tab=invoices`
                  : '/portal'
          }
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-accent-strong"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {staff ? 'All invoices' : 'Back to Invoices'}
        </Link>
        <div className="flex flex-wrap gap-2">
          {/* The same PDF that's emailed when it's paid. */}
          <a
            href={`/api/v1/invoices/${inv.id}/pdf`}
            className={`${button} bg-surface text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}
          >
            <Download className="size-4" aria-hidden />
            Download PDF
          </a>
          {inv.can_pay && (
            <button
              type="button"
              onClick={startPayment}
              disabled={pay.isPending}
              className={`${button} bg-cta text-cta-ink hover:bg-cta-hover disabled:opacity-50`}
            >
              <CreditCard className="size-4" aria-hidden />
              {pay.isPending ? 'Opening…' : 'Pay now'}
            </button>
          )}
          {inv.can_void &&
            (confirmVoid ? (
              <button
                type="button"
                onClick={() => voiding.mutate(inv.id, { onSuccess: () => setConfirmVoid(false) })}
                disabled={voiding.isPending}
                className={`${button} bg-red-600 text-white hover:bg-red-700 disabled:opacity-50`}
              >
                {voiding.isPending ? 'Voiding…' : `Yes, void invoice ${inv.number}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmVoid(true)}
                className={`${button} bg-surface text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50`}
              >
                Void
              </button>
            ))}
        </div>
      </div>

      {backFromStripe && inv.status === 'UNPAID' && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 print:hidden" role="status">
          Thank you. Stripe is confirming your payment; this page updates in a few seconds.
        </p>
      )}
      {backFromStripe && inv.status === 'PAID' && (
        <p
          className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden"
          role="status"
        >
          Payment received. A receipt is on its way to your email.
        </p>
      )}
      {(pay.isError || voiding.isError) && (
        <p className="text-sm text-red-700 print:hidden" role="alert">
          {(pay.error ?? voiding.error)?.message}
        </p>
      )}

      <InvoiceDocument invoice={inv} />
    </div>
  )
}
