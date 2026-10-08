import { useQuery } from '@tanstack/react-query'

import { fetchCarrierAuthority } from '../api/carriers'

export function useCarrierAuthority(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-authority', usdotNumber],
    queryFn: () => fetchCarrierAuthority(usdotNumber),
    staleTime: 60_000,
  })
}
