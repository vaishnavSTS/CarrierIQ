import { useQuery } from '@tanstack/react-query'

import { fetchCarrierAuthority } from '../api/carriers'
import { useCarrierApiBase } from './usePortalMode'

export function useCarrierAuthority(usdotNumber: number) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: ['carrier-authority', usdotNumber],
    queryFn: () => fetchCarrierAuthority(usdotNumber, base),
    staleTime: 60_000,
  })
}
