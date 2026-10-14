import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { homeFor, useMe } from '../../hooks/useAuth'
import type { Portal } from '../../types/auth'

/**
 * Route guard for one portal. Logged out → /login (then back here); logged in to the other
 * portal → that portal's home. This only decides which pages to show: the API checks the
 * session and role on every request, so hiding a page is never the only protection.
 */
export function RequireAuth({ portal }: { portal: Portal }) {
  const { data: user, isPending, isError } = useMe()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        <Loader2 className="size-6 animate-spin" aria-label="Loading" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Can’t reach the CarrierIQ API. Try again in a moment.
      </div>
    )
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    const login = { internal: '/team/login', client: '/login', broker: '/broker/login' }[portal]
    return <Navigate to={`${login}?next=${next}`} replace />
  }
  if (user.portal !== portal) return <Navigate to={homeFor(user.portal)} replace />
  return <Outlet />
}
