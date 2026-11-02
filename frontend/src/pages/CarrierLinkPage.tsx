import { Loader2 } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'

import { useMe } from '../hooks/useAuth'
import { carrierPathIn } from '../hooks/usePortalMode'

/**
 * /c/:usdot, the link printed on a Safety Score Report. A report is passed around, so the link
 * can't assume who opens it: it logs them in, then opens the carrier in their own portal.
 */
export function CarrierLinkPage() {
  const { usdot = '' } = useParams()
  const { data: user, isPending, isError } = useMe()
  const number = Number(usdot)

  if (!Number.isInteger(number) || number <= 0) return <Navigate to="/" replace />
  if (isPending) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-500">
        <Loader2 className="size-6 animate-spin" aria-label="Loading" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-slate-500">
        Can’t reach the CarrierSafetyScan API. Try again in a moment.
      </div>
    )
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/c/${number}`)}`} replace />
  }
  return <Navigate to={carrierPathIn(user.portal, number)} replace />
}
