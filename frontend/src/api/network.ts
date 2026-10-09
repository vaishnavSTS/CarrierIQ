import type { CarrierNetwork, IdentityEvent, IdentityEventInput } from '../types/network'
import { apiGet, apiRequest } from './client'

export function fetchCarrierNetwork(usdotNumber: number): Promise<CarrierNetwork> {
  return apiGet<CarrierNetwork>(`/carriers/${usdotNumber}/network`)
}

export function addIdentityEvent(
  usdotNumber: number,
  event: IdentityEventInput,
): Promise<IdentityEvent> {
  return apiRequest<IdentityEvent>(`/carriers/${usdotNumber}/identity-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
}
