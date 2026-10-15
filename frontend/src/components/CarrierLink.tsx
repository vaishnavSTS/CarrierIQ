import { Link } from 'react-router-dom'

import { useClientSearchEnabled } from '../hooks/useAuth'
import { useCarrierPath, usePortalMode } from '../hooks/usePortalMode'

/**
 * "USDOT 123456" for another carrier (linked by contact details or a shared VIN), opening its
 * profile. In the client portal it is plain text unless client search is switched on.
 */
export function CarrierLink({ usdotNumber }: { usdotNumber: number }) {
  const carrierPath = useCarrierPath()
  const searchEnabled = useClientSearchEnabled()
  if (usePortalMode() === 'client' && !searchEnabled)
    return <span className="font-mono text-slate-900">USDOT {usdotNumber}</span>
  return (
    <Link
      to={carrierPath(usdotNumber)}
      className="font-mono text-slate-900 underline hover:text-slate-600"
    >
      USDOT {usdotNumber}
    </Link>
  )
}
