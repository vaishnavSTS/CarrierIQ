import { useQuery } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { searchCarriers, type CarrierSearchPath } from '../api/carriers'
import { usePortalMode } from './usePortalMode'

const SEARCH_API: Record<ReturnType<typeof usePortalMode>, CarrierSearchPath> = {
  internal: '/carriers/search',
  client: '/portal/search',
  broker: '/broker/search',
}

export function useCarrierSearch(query: string) {
  const trimmed = query.trim()
  const path = SEARCH_API[usePortalMode()]
  return useQuery({
    queryKey: ['carrier-search', path, trimmed],
    queryFn: () => searchCarriers(trimmed, path),
    enabled: trimmed.length > 0,
    // A search can load carriers from FMCSA; don't repeat it for a minute.
    staleTime: 60_000,
    // Bad input (422) won't succeed on a retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status < 500) && failureCount < 1,
  })
}
