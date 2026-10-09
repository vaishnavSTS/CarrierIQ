import { useQuery } from '@tanstack/react-query'

import { fetchCarrierSignals } from '../api/carriers'

export function useCarrierSignals(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-signals', usdotNumber],
    queryFn: () => fetchCarrierSignals(usdotNumber),
    staleTime: 60_000,
  })
}
