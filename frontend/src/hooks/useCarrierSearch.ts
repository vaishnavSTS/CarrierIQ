import { useQuery } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { searchCarriers } from '../api/carriers'

export function useCarrierSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['carrier-search', trimmed],
    queryFn: () => searchCarriers(trimmed),
    enabled: trimmed.length > 0,
    // A search can load carriers from FMCSA; don't repeat it for a minute.
    staleTime: 60_000,
    // Bad input (422) won't succeed on a retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status < 500) && failureCount < 1,
  })
}
