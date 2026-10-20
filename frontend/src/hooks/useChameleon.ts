import { useQuery } from '@tanstack/react-query'

import { fetchChameleonCheck } from '../api/chameleon'
import { useCarrierApiBase } from './usePortalMode'

/** The Chameleon check for a carrier (staff and broker portals). */
export function useChameleonCheck(usdotNumber: number) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: ['carrier-chameleon', usdotNumber],
    queryFn: () => fetchChameleonCheck(usdotNumber, base),
    staleTime: 60_000,
  })
}
