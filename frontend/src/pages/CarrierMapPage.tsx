import { MapSection } from '../features/landing/MapSection'
import { Accent } from '../features/landing/landingParts'
import { useClientSearchEnabled } from '../hooks/useAuth'
import { useCarrierPath, usePortalMode } from '../hooks/usePortalMode'

/**
 * The carrier map in the carrier, broker and insurance agent portals: every interstate carrier in
 * each state (the public pages show 10). In the broker portal (brokers and insurance agents) a
 * clicked carrier opens a card with its phone, email and address.
 */
export function CarrierMapPage() {
  const mode = usePortalMode()
  const carrierPath = useCarrierPath()
  const searchEnabled = useClientSearchEnabled()
  // Brokers and insurance agents vet carriers, so they can switch to inactive ones too.
  const vetting = mode === 'broker'

  // A carrier account opens other carriers only while carrier search is on.
  const canOpen = mode !== 'client' || searchEnabled
  return (
    <MapSection
      portal
      allowInactive={vetting}
      contactCards={vetting}
      carrierLink={(usdot) => (canOpen ? carrierPath(usdot) : null)}
      title={
        <>
          Every carrier, <Accent>state by state</Accent>
        </>
      }
      aside={
        vetting
          ? 'Click a state for every active or inactive interstate carrier in it: newest, largest, A–Z, new this month or with a Satisfactory rating.'
          : 'Click a state for every active interstate carrier in it: newest, largest, A–Z, new this month or with a Satisfactory rating.'
      }
    />
  )
}
