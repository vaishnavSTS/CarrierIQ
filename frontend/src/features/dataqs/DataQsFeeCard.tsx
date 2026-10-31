import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, CreditCard, Lock, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { usePayDataQsFee } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase } from '../../types/dataqs'
import { primaryButton } from './ui'

/** What the DataQs fee covers, shown in the pop-up. */
const INCLUDED = [
  'STS reviews your request and evidence',
  'STS prepares the request for your approval',
  'STS files it with FMCSA DataQs and tracks it to a decision',
]

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
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-black/5">
            {/* Header: brand gradient, the price large */}
            <div className="relative brand-panel px-7 pb-7 pt-6 text-white">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white"
              >
                <X className="size-5" aria-hidden />
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Request submitted
              </span>
              <h2 id="fee-title" className="mt-3 text-2xl font-semibold tracking-tight">
                Pay the DataQs filing fee
              </h2>
              <p className="mt-1 text-sm text-white/85">
                One step left: STS starts reviewing your request as soon as it’s paid.
              </p>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-5xl font-bold tracking-tight">{amount}</span>
                <span className="pb-1.5 text-sm text-white/85">per inspection</span>
              </div>
            </div>

            <div className="space-y-5 px-7 py-6">
              <div>
                <p className="text-sm font-medium text-slate-900">What’s included</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {INCLUDED.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-baseline justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-600">
                  DataQs request · invoice {fee.invoice_number}
                </span>
                <span className="text-base font-semibold text-slate-950">{amount}</span>
              </div>
              <PayButton caseId={c.id} amount={amount} full />
              <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <Lock className="size-3.5" aria-hidden />
                Secure payment by Stripe. Your card details never reach CarrierSafetyScan.
              </p>
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
  full = false,
}: {
  caseId: number
  amount: string
  invoiceNumber?: number
  /** The pop-up's big full-width button */
  full?: boolean
}) {
  const pay = usePayDataQsFee(caseId)
  return (
    <div className="space-y-2">
      <div className={full ? '' : 'flex flex-wrap items-center gap-3'}>
        <button
          type="button"
          disabled={pay.isPending}
          onClick={() =>
            pay.mutate(undefined, { onSuccess: ({ url }) => window.location.assign(url) })
          }
          className={
            full
              ? 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-5 py-3.5 text-base font-semibold text-cta-ink shadow-lg shadow-violet-500/25 hover:bg-cta-hover disabled:opacity-60'
              : `${primaryButton} inline-flex items-center gap-1.5`
          }
        >
          <CreditCard className={full ? 'size-5' : 'size-4'} aria-hidden />
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
