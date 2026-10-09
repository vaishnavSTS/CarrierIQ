import { useMutation, useQueryClient } from '@tanstack/react-query'

import { reviewSignal } from '../api/carriers'
import type { CarrierSignals, ReviewStatus } from '../types/carrierSignals'

/** Record a review decision, then update the signal list and the open-signal counts. */
export function useReviewSignal(usdotNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: ReviewStatus; note: string | null }) =>
      reviewSignal(id, status, note),
    onSuccess: (updated) => {
      queryClient.setQueryData<CarrierSignals>(
        ['carrier-signals', usdotNumber],
        (current) =>
          current && {
            ...current,
            signals: current.signals.map((s) => (s.id === updated.id ? updated : s)),
          },
      )
      // The header and search results show how many signals are still open.
      void queryClient.invalidateQueries({ queryKey: ['carrier-profile', usdotNumber] })
      void queryClient.invalidateQueries({ queryKey: ['carrier-search'] })
    },
  })
}
