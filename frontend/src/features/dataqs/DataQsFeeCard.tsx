import { useQueryClient } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { usePayDataQsFee } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase } from '../../types/dataqs'
import { primaryButton } from './ui'

const money = (amount: string) =>
  Number(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * The $50 DataQs filing fee while it's unpaid. The carrier pays on Stripe's page and comes back
 * here (?paid=1), where the case updates once Stripe confirms; STS then starts. STS staff see that
 * the case waits for it.
 */
export function DataQsFeeCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const [params] = useSearchParams()
  const back = params.get('paid') === '1'
  const pay = usePayDataQsFee(c.id)
  const client = useQueryClient()
  const fee = c.fee

  // Back from Stripe: its webhook marks the fee paid within seconds; look again until it has.
  useEffect(() => {
    if (!back || fee?.status !== 'UNPAID') return
    const timer = setInterval(() => client.invalidateQueries({ queryKey: ['dataqs'] }), 3000)
    return () => clearInterval(timer)
  }, [back, fee?.status, client])

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
        <span className="text-xs text-slate-600">
          Invoice {fee.invoice_number} · by card on Stripe’s secure page
        </span>
      </div>
      {pay.isError && (
        <p className="text-red-700" role="alert">
          {pay.error.message}
        </p>
      )}
    </div>
  )
}
