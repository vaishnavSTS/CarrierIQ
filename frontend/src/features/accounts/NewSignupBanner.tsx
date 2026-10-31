import { ArrowRight, UserPlus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { useAccounts } from '../../hooks/useAccounts'

function plural(count: number, word: string): string {
  return `${count} new ${word}${count === 1 ? '' : 's'}`
}

/**
 * STS admins, on every internal page: who signed up since they last looked (brokers and clients
 * counted apart), linking to the Accounts pop-up. Hidden on the Accounts page, which has the
 * pop-up itself, and once "Got it" marks the sign-ups as seen.
 */
export function NewSignupBanner() {
  const { data } = useAccounts()
  const { pathname } = useLocation()
  const fresh = data?.filter((a) => a.is_new) ?? []
  if (fresh.length === 0 || pathname === '/accounts') return null

  const agents = fresh.filter((a) => a.role === 'INSURANCE_AGENT').length
  const brokers = fresh.filter((a) => a.portal === 'broker').length - agents
  const clients = fresh.length - brokers - agents
  const parts = [
    brokers > 0 ? plural(brokers, 'broker') : null,
    agents > 0 ? plural(agents, 'insurance agent') : null,
    clients > 0 ? plural(clients, 'client') : null,
  ].filter(Boolean)

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm"
    >
      <UserPlus className="size-4 shrink-0 text-sky-700" aria-hidden />
      <span className="text-slate-900">
        <span className="font-medium">{parts.join(' and ')}</span> signed up. They can already use
        their portal.
      </span>
      <Link
        to="/accounts"
        className="ml-auto inline-flex items-center gap-1 font-medium text-accent-strong hover:underline"
      >
        Review sign-ups
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  )
}
