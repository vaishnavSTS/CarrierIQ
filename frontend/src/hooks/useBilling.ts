import { useMutation, useQueryClient } from '@tanstack/react-query'

import { cancelSubscription, manageBilling, resumeSubscription, subscribe } from '../api/billing'
import { ME_KEY } from './useAuth'

/** Opens Stripe's subscribe page (same tab: Stripe returns here). */
export function useSubscribe() {
  return useMutation({
    mutationFn: subscribe,
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

/** Opens Stripe's billing page (same tab: Stripe returns here). */
export function useManageBilling() {
  return useMutation({
    mutationFn: manageBilling,
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

/** Cancel the subscription: it runs to the end of the paid month, then the login locks. */
export function useCancelSubscription() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => client.invalidateQueries({ queryKey: ME_KEY }),
  })
}

/** Keep the subscription after all (before the paid month ends). */
export function useResumeSubscription() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: resumeSubscription,
    onSuccess: () => client.invalidateQueries({ queryKey: ME_KEY }),
  })
}
