import { useMutation } from '@tanstack/react-query'

import { manageBilling, subscribe } from '../api/billing'

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
