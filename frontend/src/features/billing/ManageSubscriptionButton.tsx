import { CreditCard } from 'lucide-react'

import { useMe } from '../../hooks/useAuth'
import { useManageBilling } from '../../hooks/useBilling'

/** Stripe's billing page (change the card, receipts, cancel), once the login has subscribed. */
export function ManageSubscriptionButton({ className }: { className: string }) {
  const { data: me } = useMe()
  const manage = useManageBilling()
  if (!me?.billing?.can_manage) return null
  return (
    <button
      type="button"
      onClick={() => manage.mutate()}
      disabled={manage.isPending}
      title={manage.isError ? manage.error.message : undefined}
      className={className}
    >
      <CreditCard className="size-4" aria-hidden />
      {manage.isPending ? 'Opening…' : 'Manage subscription'}
    </button>
  )
}
