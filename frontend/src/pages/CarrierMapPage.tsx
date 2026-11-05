import { Navigate } from 'react-router-dom'

import { MapSection } from '../features/landing/MapSection'
import { Accent } from '../features/landing/landingParts'
import { useClientSearchEnabled, useMe } from '../hooks/useAuth'
import { useCarrierPath, usePortalMode } from '../hooks/usePortalMode'

/**
 * The carrier map in the carrier and insurance agent portals: every interstate carrier in each
 * state (the public pages show 10). Brokers don't have it: they go back to their portal's home.
 */
export function CarrierMapPage() {
  const { data: me } = useMe()
  const mode = usePortalMode()
  const carrierPath = useCarrierPath()
  const searchEnabled = useClientSearchEnabled()
  const agent = me?.role === 'INSURANCE_AGENT'

  if (mode === 'broker' && me && !agent) return <Navigate to="/broker" replace />

  // A carrier account opens other carriers only while carrier search is on.
  const canOpen = mode !== 'client' || searchEnabled
  return (
    <MapSection
      portal
      allowInactive={agent}
      carrierLink={(usdot) => (canOpen ? carrierPath(usdot) : null)}
      title={
        <>
          Every carrier, <Accent>state by state</Accent>
        </>
      }
      aside={
        agent
          ? 'Click a state for every active or inactive interstate carrier in it: newest, largest or A–Z.'
          : 'Click a state for every active interstate carrier in it: newest, largest or A–Z.'
      }
    />
  )
}
