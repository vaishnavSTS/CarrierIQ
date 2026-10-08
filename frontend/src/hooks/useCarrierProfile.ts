import { useQuery } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { fetchCarrierProfile } from '../api/carriers'

export function useCarrierProfile(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-profile', usdotNumber],
    queryFn: () => fetchCarrierProfile(usdotNumber),
    enabled: Number.isInteger(usdotNumber) && usdotNumber > 0,
    // The backend refreshes from FMCSA at most daily; a minute of caching avoids refetching
    // when moving between search and profile.
    staleTime: 60_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status < 500) && failureCount < 1,
  })
}
