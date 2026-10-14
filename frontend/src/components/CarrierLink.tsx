import { Link } from 'react-router-dom'

import { useCarrierPath, usePortalMode } from '../hooks/usePortalMode'

/**
 * "USDOT 123456" for another carrier (linked by contact details or a shared VIN). Staff and
 * brokers can open its profile; in the client portal it is plain text, since clients see only
 * their own carriers.
 */
export function CarrierLink({ usdotNumber }: { usdotNumber: number }) {
  const mode = usePortalMode()
  const carrierPath = useCarrierPath()
  if (mode === 'client')
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
