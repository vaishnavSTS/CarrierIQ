import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { fetchCarrierInspections, fetchCarrierSafety } from '../api/carriers'

export function useCarrierSafety(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-safety', usdotNumber],
    queryFn: () => fetchCarrierSafety(usdotNumber),
    staleTime: 60_000,
  })
}

export function useCarrierInspections(
  usdotNumber: number,
  page: number,
  pageSize: number,
  oosOnly: boolean,
) {
  return useQuery({
    queryKey: ['carrier-inspections', usdotNumber, page, pageSize, oosOnly],
    queryFn: () => fetchCarrierInspections(usdotNumber, page, pageSize, oosOnly),
    staleTime: 60_000,
    // Keep showing the current page while the next one loads (no layout jump).
    placeholderData: keepPreviousData,
  })
}
