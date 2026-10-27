import type {
  ComplianceCheckoutInput,
  ComplianceRequest,
  ComplianceServiceId,
  ServicePrice,
  UcrStatus,
} from '../types/compliance'
import { apiGet, apiRequest } from './client'

export function fetchUcrStatus(usdotNumber: number): Promise<UcrStatus> {
  return apiGet(`/compliance/carriers/${usdotNumber}/ucr`)
}

export function fetchCarrierRequests(
  usdotNumber: number,
): Promise<{ requests: ComplianceRequest[] }> {
  return apiGet(`/compliance/carriers/${usdotNumber}/requests`)
}

export function createComplianceRequest(
  usdotNumber: number,
  service: ComplianceServiceId,
  note: string | null,
): Promise<ComplianceRequest> {
  return apiRequest(`/compliance/carriers/${usdotNumber}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, note }),
  })
}

/** The services paid online for this carrier, with the option that fits it. */
export function fetchCompliancePrices(usdotNumber: number): Promise<{ services: ServicePrice[] }> {
  return apiGet(`/compliance/carriers/${usdotNumber}/prices`)
}

/** Clients: create the invoice on STS's website; answers its payment page. */
export function checkoutCompliance(
  usdotNumber: number,
  input: ComplianceCheckoutInput,
): Promise<{ payment_url: string; request: ComplianceRequest }> {
  return apiRequest(`/compliance/carriers/${usdotNumber}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** STS staff: every client's requests (status: OPEN | HANDLED, or all). */
export function fetchAllRequests(
  status: 'OPEN' | 'HANDLED' | null,
): Promise<{ requests: ComplianceRequest[] }> {
  return apiGet(`/compliance/requests${status ? `?status=${status}` : ''}`)
}

export function markRequestHandled(requestId: number): Promise<ComplianceRequest> {
  return apiRequest(`/compliance/requests/${requestId}/handled`, { method: 'POST' })
}
