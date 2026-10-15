import { usePortalOverview } from './useAuth'
import { usePortalMode } from './usePortalMode'

/**
 * In the client portal: is this one of the client's own carriers (rather than one they looked
 * up)? Wording such as "How brokers see you" applies only to their own.
 */
export function useIsOwnCarrier(usdotNumber: number): boolean {
  const client = usePortalMode() === 'client'
  const { data } = usePortalOverview(client)
  return client && (data?.carriers.some((c) => c.usdot_number === usdotNumber) ?? false)
}
