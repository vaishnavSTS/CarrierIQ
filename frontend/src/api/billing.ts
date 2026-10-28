import { apiRequest } from './client'

/** Stripe's page to start the $25/month subscription; it returns to the portal (?subscribed=1). */
export function subscribe(): Promise<{ url: string }> {
  return apiRequest('/billing/subscribe', { method: 'POST' })
}

/** Stripe's billing page: change the card, see receipts, cancel. */
export function manageBilling(): Promise<{ url: string }> {
  return apiRequest('/billing/manage', { method: 'POST' })
}
