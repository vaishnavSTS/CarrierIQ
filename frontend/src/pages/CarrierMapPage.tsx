import { MapSection } from '../features/landing/MapSection'
import { Accent } from '../features/landing/landingParts'
import { useCarrierPath } from '../hooks/usePortalMode'

/**
 * The carrier map in the broker portal (brokers and insurance agents): every interstate carrier in
 * each state (the public pages show 10), active or inactive, and a clicked carrier's card with its
 * phone, email and address. The carrier portal has no map.
 */
export function CarrierMapPage() {
  const carrierPath = useCarrierPath()
  return (
    <MapSection
      portal
      allowInactive
      contactCards
      carrierLink={carrierPath}
      title={
        <>
          Every carrier, <Accent>state by state</Accent>
        </>
      }
      aside="Click a state for every active or inactive interstate carrier in it: newest, largest, A–Z, with a Satisfactory rating or hauling hazmat."
    />
  )
}
