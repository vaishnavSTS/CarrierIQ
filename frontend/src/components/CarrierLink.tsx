import { Link } from 'react-router-dom'

import { useCarrierPath } from '../hooks/usePortalMode'

/** "USDOT 123456" for another carrier (linked by contact details or a shared VIN), opening its
 * profile in the current portal. */
export function CarrierLink({ usdotNumber }: { usdotNumber: number }) {
  const carrierPath = useCarrierPath()
  return (
    <Link
      to={carrierPath(usdotNumber)}
      className="font-mono text-slate-900 underline hover:text-slate-600"
    >
      USDOT {usdotNumber}
    </Link>
  )
}
