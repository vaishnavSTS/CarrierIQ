import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { usePayDataQsFee } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase } from '../../types/dataqs'
import { primaryButton, secondaryButton } from './ui'

const money = (amount: string) =>
  Number(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * The $50 DataQs filing fee while it's unpaid. For the carrier it pops up as soon as the case is
 * submitted (and whenever they open it unpaid); they pay on Stripe's page and come back here
 * (?paid=1), where the case updates once Stripe confirms. Then the FMCSA sign-in question pops up
 * (DataQsOtpCard). If they close the pop-up, this card stays. STS staff see that it waits.
 */
export function DataQsFeeCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const [params] = useSearchParams()
  const back = params.get('paid') === '1'
  const client = useQueryClient()
  const fee = c.fee
  const [open, setOpen] = useState(!staff && !back)

  // Back from Stripe: its webhook marks the fee paid within seconds; look again until it has.
  useEffect(() => {
    if (!back || fee?.status !== 'UNPAID') return
    const timer = setInterval(() => client.invalidateQueries({ queryKey: ['dataqs'] }), 3000)
    return () => clearInterval(timer)
  }, [back, fee?.status, client])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!fee || fee.status === 'PAID') return null
  const amount = money(fee.amount)

  if (staff) {
    return (
      <p className="text-sm text-slate-700">
        The carrier hasn’t paid the {amount} DataQs fee yet (
        <Link to={`/invoices/${fee.invoice_id}`} className="text-accent-strong hover:underline">
          invoice {fee.invoice_number}
        </Link>
        ). Assess the case once it’s paid; you’ll be emailed when it is.
      </p>
    )
  }
  return (
    <>
      <div className="space-y-3 text-sm">
        {back ? (
          <p className="rounded-md bg-amber-50 p-3 text-amber-900" role="status">
            Thank you. Stripe is confirming your payment; this page updates in a few seconds.
          </p>
        ) : (
          <p className="text-slate-700">
            The DataQs filing fee is <span className="font-semibold">{amount}</span> for this
            inspection. STS starts reviewing your request as soon as it’s paid.
          </p>
        )}
        <PayButton caseId={c.id} amount={amount} invoiceNumber={fee.invoice_number} />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fee-title"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="fee-title" className="text-lg font-semibold text-slate-950">
                  Pay the DataQs filing fee
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Your request is submitted. The fee is{' '}
                  <span className="font-semibold text-slate-900">{amount}</span> per inspection; STS
                  starts reviewing it as soon as it’s paid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-600">DataQs request · invoice {fee.invoice_number}</span>
              <span className="text-lg font-semibold text-slate-950">{amount}</span>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
                Pay later
              </button>
              <PayButton caseId={c.id} amount={amount} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Opens Stripe's payment page for the fee (it returns to the case). */
function PayButton({
  caseId,
  amount,
  invoiceNumber,
}: {
  caseId: number
  amount: string
  invoiceNumber?: number
}) {
  const pay = usePayDataQsFee(caseId)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pay.isPending}
          onClick={() =>
            pay.mutate(undefined, { onSuccess: ({ url }) => window.location.assign(url) })
          }
          className={`${primaryButton} inline-flex items-center gap-1.5`}
        >
          <CreditCard className="size-4" aria-hidden />
          {pay.isPending ? 'Opening the payment page…' : `Pay ${amount}`}
        </button>
        {invoiceNumber !== undefined && (
          <span className="text-xs text-slate-600">
            Invoice {invoiceNumber} · by card on Stripe’s secure page
          </span>
        )}
      </div>
      {pay.isError && (
        <p className="text-sm text-red-700" role="alert">
          {pay.error.message}
        </p>
      )}
    </div>
  )
}
