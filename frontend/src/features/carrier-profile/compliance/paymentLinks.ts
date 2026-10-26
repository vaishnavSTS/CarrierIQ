import type { ComplianceServiceId } from '../../../types/compliance'

/**
 * Online payment links for compliance services (e.g. Stripe Payment Links, which email STS when
 * someone pays). A service with a link here gets a "Pay online" button on the Compliance tab;
 * without one, clients use "Get assistance" and STS follows up. Add each link when STS has it.
 */
export const PAYMENT_LINKS: Partial<Record<ComplianceServiceId, string>> = {}
