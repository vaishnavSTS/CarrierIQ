import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { addIdentityEvent, fetchCarrierNetwork } from '../api/network'
import type { IdentityEventInput } from '../types/network'

export function useCarrierNetwork(usdotNumber: number) {
  return useQuery({
    queryKey: ['carrier-network', usdotNumber],
    queryFn: () => fetchCarrierNetwork(usdotNumber),
    staleTime: 60_000,
  })
}

/** Record a team note or ownership event; it also changes the timeline and signals. */
export function useAddIdentityEvent(usdotNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (event: IdentityEventInput) => addIdentityEvent(usdotNumber, event),
    onSuccess: () => {
      for (const key of ['carrier-network', 'carrier-profile', 'carrier-signals']) {
        void queryClient.invalidateQueries({ queryKey: [key, usdotNumber] })
      }
    },
  })
}
