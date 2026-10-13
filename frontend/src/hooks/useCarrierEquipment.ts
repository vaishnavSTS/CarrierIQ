import { useQuery } from '@tanstack/react-query'

import { fetchCarrierEquipment } from '../api/carriers'
import { useCarrierApiBase } from './usePortalMode'

export function useCarrierEquipment(usdotNumber: number) {
  const base = useCarrierApiBase()
  return useQuery({
    queryKey: ['carrier-equipment', usdotNumber],
    queryFn: () => fetchCarrierEquipment(usdotNumber, base),
    staleTime: 60_000,
  })
}
