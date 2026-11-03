import type { Billing } from '../types/auth'
import { apiRequest } from './client'

/** Stripe's page to start the $49/month subscription; it returns to the portal (?subscribed=1). */
export function subscribe(): Promise<{ url: string }> {
  return apiRequest('/billing/subscribe', { method: 'POST' })
}

/** Stripe's billing page: change the card, see receipts, cancel. */
export function manageBilling(): Promise<{ url: string }> {
  return apiRequest('/billing/manage', { method: 'POST' })
}

/** Cancel: no more charges; the subscription ends with the month already paid for. */
export function cancelSubscription(): Promise<Billing | null> {
  return apiRequest('/billing/cancel', { method: 'POST' })
}

/** Undo a cancellation before the paid month ends. */
export function resumeSubscription(): Promise<Billing | null> {
  return apiRequest('/billing/resume', { method: 'POST' })
}
