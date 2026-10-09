import { useQuery } from '@tanstack/react-query'

import { fetchCarrierEquipment } from '../api/carriers'

export function useCarrierEquipment(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-equipment', usdotNumber],
    queryFn: () => fetchCarrierEquipment(usdotNumber),
    staleTime: 60_000,
  })
}
