import type { CarrierSearchResponse } from '../types/carrier'
import type { CarrierAuthority } from '../types/carrierAuthority'
import type { CarrierEquipment } from '../types/carrierEquipment'
import type { CarrierProfile } from '../types/carrierProfile'
import type { CarrierSafety, InspectionPage } from '../types/carrierSafety'
import type { CarrierSignals, ReviewStatus, Signal } from '../types/carrierSignals'
import { apiGet, apiRequest } from './client'

export function searchCarriers(query: string): Promise<CarrierSearchResponse> {
  return apiGet<CarrierSearchResponse>(`/carriers/search?q=${encodeURIComponent(query)}`)
}

export function fetchCarrierProfile(usdotNumber: number): Promise<CarrierProfile> {
  return apiGet<CarrierProfile>(`/carriers/${usdotNumber}`)
}

export function fetchCarrierSafety(usdotNumber: number): Promise<CarrierSafety> {
  return apiGet<CarrierSafety>(`/carriers/${usdotNumber}/safety`)
}

export function fetchCarrierInspections(
  usdotNumber: number,
  page: number,
  pageSize: number,
  oosOnly: boolean,
): Promise<InspectionPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    oos_only: String(oosOnly),
  })
  return apiGet<InspectionPage>(`/carriers/${usdotNumber}/inspections?${params}`)
}

export function fetchCarrierAuthority(usdotNumber: number): Promise<CarrierAuthority> {
  return apiGet<CarrierAuthority>(`/carriers/${usdotNumber}/authority`)
}

export function fetchCarrierEquipment(usdotNumber: number): Promise<CarrierEquipment> {
  return apiGet<CarrierEquipment>(`/carriers/${usdotNumber}/equipment`)
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
