import type { CarrierSearchResponse } from '../types/carrier'
import type { CarrierAuthority } from '../types/carrierAuthority'
import type { CarrierEquipment } from '../types/carrierEquipment'
import type { CarrierProfile } from '../types/carrierProfile'
import type { CarrierSafety, InspectionPage } from '../types/carrierSafety'
import type { CarrierSignals, ReviewStatus, Signal } from '../types/carrierSignals'
import type { CarrierApiBase } from '../hooks/usePortalMode'
import { apiGet, apiRequest } from './client'

/** `path` is /broker/search in the broker portal (no STS review status in the answer). */
export function searchCarriers(
  query: string,
  path: '/carriers/search' | '/broker/search' = '/carriers/search',
): Promise<CarrierSearchResponse> {
  return apiGet<CarrierSearchResponse>(`${path}?q=${encodeURIComponent(query)}`)
}

/** `base` is /portal/carriers or /broker/carriers outside the internal portal (usePortalMode). */
export function fetchCarrierProfile(
  usdotNumber: number,
  base: CarrierApiBase = '/carriers',
): Promise<CarrierProfile> {
  return apiGet<CarrierProfile>(`${base}/${usdotNumber}`)
}

export function fetchCarrierSafety(
  usdotNumber: number,
  base: CarrierApiBase = '/carriers',
): Promise<CarrierSafety> {
  return apiGet<CarrierSafety>(`${base}/${usdotNumber}/safety`)
}

export function fetchCarrierInspections(
  usdotNumber: number,
  page: number,
  pageSize: number,
  oosOnly: boolean,
  base: CarrierApiBase = '/carriers',
): Promise<InspectionPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    oos_only: String(oosOnly),
  })
  return apiGet<InspectionPage>(`${base}/${usdotNumber}/inspections?${params}`)
}

export function fetchCarrierAuthority(
  usdotNumber: number,
  base: CarrierApiBase = '/carriers',
): Promise<CarrierAuthority> {
  return apiGet<CarrierAuthority>(`${base}/${usdotNumber}/authority`)
}

export function fetchCarrierEquipment(
  usdotNumber: number,
  base: CarrierApiBase = '/carriers',
): Promise<CarrierEquipment> {
  return apiGet<CarrierEquipment>(`${base}/${usdotNumber}/equipment`)
}

export function fetchCarrierSignals(usdotNumber: number): Promise<CarrierSignals> {
  return apiGet<CarrierSignals>(`/carriers/${usdotNumber}/signals`)
}

export function reviewSignal(
  signalId: number,
  status: ReviewStatus,
  note: string | null,
): Promise<Signal> {
  return apiRequest<Signal>(`/signals/${signalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })
}
