import type { ComplianceRequest, ComplianceServiceId, UcrStatus } from '../types/compliance'
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

/** STS staff: every client's requests (status: OPEN | HANDLED, or all). */
export function fetchAllRequests(
  status: 'OPEN' | 'HANDLED' | null,
): Promise<{ requests: ComplianceRequest[] }> {
  return apiGet(`/compliance/requests${status ? `?status=${status}` : ''}`)
}

export function markRequestHandled(requestId: number): Promise<ComplianceRequest> {
  return apiRequest(`/compliance/requests/${requestId}/handled`, { method: 'POST' })
}
