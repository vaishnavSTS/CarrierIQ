import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { fetchCarrierInspections, fetchCarrierSafety } from '../api/carriers'
import { useCarrierApiBase } from './usePortalMode'

export function useCarrierSafety(usdotNumber: number) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: ['carrier-safety', usdotNumber],
    queryFn: () => fetchCarrierSafety(usdotNumber, base),
    staleTime: 60_000,
  })
}

export function useCarrierInspections(
  usdotNumber: number,
  page: number,
  pageSize: number,
  oosOnly: boolean,
  filters: { state?: string; search?: string } = {},
) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: [
      'carrier-inspections',
      usdotNumber,
      page,
      pageSize,
      oosOnly,
      filters.state ?? '',
      filters.search ?? '',
    ],
    queryFn: () => fetchCarrierInspections(usdotNumber, page, pageSize, oosOnly, base, filters),
    staleTime: 60_000,
    // Keep showing the current page while the next one loads (no layout jump).
    placeholderData: keepPreviousData,
  })
}

const ALL_PAGE_SIZE = 100 // the API's largest page

/** Every inspection on file for the carrier, newest first: the list at the end of the report. */
export function useAllCarrierInspections(usdotNumber: number) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: ['carrier-inspections-all', usdotNumber, base],
    queryFn: async () => {
      const first = await fetchCarrierInspections(usdotNumber, 1, ALL_PAGE_SIZE, false, base)
      const more = Math.ceil(first.total / ALL_PAGE_SIZE) - 1
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, more) }, (_, i) =>
          fetchCarrierInspections(usdotNumber, i + 2, ALL_PAGE_SIZE, false, base),
        ),
      )
      // Once each, even if an inspection loaded between two pages moved the others along.
      const seen = new Set<string>()
      return [first, ...rest]
        .flatMap((page) => page.inspections)
        .filter((i) => !seen.has(i.inspection_id) && Boolean(seen.add(i.inspection_id)))
    },
    staleTime: 60_000,
  })
}
