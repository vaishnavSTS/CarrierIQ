import { useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, Lock, LogOut, Sparkles } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { ME_KEY, useLogout, useMe } from '../../hooks/useAuth'
import { useSubscribe } from '../../hooks/useBilling'

/** What the subscription unlocks, shown in the pop-up. */
const INCLUDED = [
  'Carrier safety scores, inspections and violations',
  'What brokers see when they vet a carrier',
  'DataQs requests and compliance services from STS',
]

/** Pages still open when locked: invoices they already owe. */
const OPEN_WHEN_LOCKED = /^\/(portal|broker)\/invoices\//

const dollars = (amount: string) => `$${Number(amount).toFixed(0)}`

/**
 * The $49/month subscription in the client and broker portals (backend:
 * app/services/subscription.py). On the one-month (30-day) trial: a banner with the days left. Once it ends
 * without a subscription: the page is hidden behind a pop-up that can't be closed, whose button
 * opens Stripe's subscribe page. Back from Stripe (?subscribed=1) it waits for Stripe's webhook.
 * Logins that never pay (older accounts, STS staff) see nothing of this.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { data: me } = useMe()
  const billing = me?.billing
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const back = params.get('subscribed') === '1'
  const client = useQueryClient()

  // Back from Stripe: its webhook marks the subscription active within seconds; look again.
  useEffect(() => {
    if (!back || !billing || billing.state === 'active') return
    const timer = setInterval(() => client.invalidateQueries({ queryKey: ME_KEY }), 3000)
    return () => clearInterval(timer)
  }, [back, billing, client])

  if (!billing) return <>{children}</>
  if (billing.state === 'locked' && !OPEN_WHEN_LOCKED.test(pathname)) {
    return <SubscribeWall price={billing.monthly_price} confirming={back} />
  }
  return (
    <>
      {billing.state === 'trial' && (
        <TrialBanner daysLeft={billing.trial_days_left ?? 0} price={billing.monthly_price} />
      )}
      {billing.state === 'active' && back && (
        <p
          className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          role="status"
        >
          Thank you, you’re subscribed. Stripe charges {dollars(billing.monthly_price)} each month;
          manage or cancel it from Manage subscription in the menu.
        </p>
      )}
      {children}
    </>
  )
}

function TrialBanner({ daysLeft, price }: { daysLeft: number; price: string }) {
  const subscribe = useSubscribe()
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-sm text-violet-950">
        <Sparkles className="size-4 shrink-0 text-violet-600" aria-hidden />
        <span>
          <span className="font-semibold">
            Free trial: {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left.
          </span>{' '}
          Then {dollars(price)} a month to keep using CarrierSafetyScan.
        </span>
      </p>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <button
          type="button"
          onClick={() => subscribe.mutate()}
          disabled={subscribe.isPending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-cta-ink hover:bg-cta-hover disabled:opacity-60"
        >
          <CreditCard className="size-4" aria-hidden />
          {subscribe.isPending ? 'Opening Stripe…' : 'Subscribe now'}
        </button>
        {subscribe.isError && (
          <span className="text-xs text-red-700" role="alert">
            {subscribe.error.message}
          </span>
        )}
      </div>
    </div>
  )
}

function SubscribeWall({ price, confirming }: { price: string; confirming: boolean }) {
  const subscribe = useSubscribe()
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-black/5">
        <div className="brand-panel px-7 pb-7 pt-6 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Lock className="size-3.5" aria-hidden />
            Your free trial has ended
          </span>
          <h2 id="subscribe-title" className="mt-3 text-2xl font-semibold tracking-tight">
            Subscribe to keep using CarrierSafetyScan
          </h2>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-5xl font-bold tracking-tight">{dollars(price)}</span>
            <span className="pb-1.5 text-sm text-white/85">per month · cancel anytime</span>
          </div>
        </div>

        <div className="space-y-5 px-7 py-6">
          {confirming ? (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
              Thank you. Stripe is confirming your subscription; this page opens in a few seconds.
            </p>
          ) : (
            <>
              <ul className="space-y-2 text-sm text-slate-700">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-5 py-3.5 text-base font-semibold text-cta-ink shadow-lg shadow-violet-500/25 hover:bg-cta-hover disabled:opacity-60"
              >
                <CreditCard className="size-5" aria-hidden />
                {subscribe.isPending
                  ? 'Opening the payment page…'
                  : `Subscribe for ${dollars(price)}/month`}
              </button>
              {subscribe.isError && (
                <p className="text-sm text-red-700" role="alert">
                  {subscribe.error.message}
                </p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                <Lock className="size-3.5 shrink-0" aria-hidden />
                Secure payment by Stripe, charged monthly. Cancel anytime.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
            disabled={logout.isPending}
            className="mx-auto flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
