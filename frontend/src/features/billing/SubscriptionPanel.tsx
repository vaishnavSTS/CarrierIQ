import { CreditCard } from 'lucide-react'
import { useState } from 'react'

import { useMe } from '../../hooks/useAuth'
import { useCancelSubscription } from '../../hooks/useBilling'
import { formatDate } from '../../utils/format'

/**
 * On the portal home: the running subscription, and cancelling it. Cancelling stops the charges:
 * Stripe ends the subscription with the month already paid for, and the app stays open until then
 * (backend: SubscriptionService.cancel).
 */
export function SubscriptionPanel() {
  const { data: me } = useMe()
  const cancel = useCancelSubscription()
  const [asking, setAsking] = useState(false)
  const billing = me?.billing
  if (!billing?.can_cancel) return null
  const until = billing.current_period_end
    ? formatDate(billing.current_period_end.slice(0, 10))
    : null

  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <CreditCard className="size-4 shrink-0 text-slate-500" aria-hidden />
          <span>
            <span className="font-semibold text-slate-900">Your subscription:</span> $
            {Number(billing.monthly_price).toFixed(0)} a month
            {until && <>, paid until {until}</>}.
          </span>
        </p>
        {!asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="tap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Cancel subscription
          </button>
        )}
      </div>
      {asking && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-canvas p-4 text-sm">
          <p className="text-slate-800">
            Cancel your subscription? You won’t be charged again, and you keep full access
            {until ? <> until {until}</> : ' until the end of the month you’ve paid for'}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSuccess: () => setAsking(false) })}
              className="tap rounded-lg bg-red-700 px-3 py-1.5 font-medium text-surface hover:bg-red-800 disabled:opacity-50"
            >
              {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="tap rounded-lg px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Keep my subscription
            </button>
          </div>
          {cancel.isError && <p className="mt-2 text-red-700">{cancel.error.message}</p>}
        </div>
      )}
    </section>
  )
}
