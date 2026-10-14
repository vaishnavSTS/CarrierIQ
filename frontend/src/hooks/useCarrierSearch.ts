import { useQuery } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { searchCarriers } from '../api/carriers'
import { useIsBrokerPortal } from './usePortalMode'

export function useCarrierSearch(query: string) {
  const trimmed = query.trim()
  const path = useIsBrokerPortal() ? '/broker/search' : '/carriers/search'
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
