import type { CarrierSearchResponse } from '../types/carrier'
import type { CarrierProfile } from '../types/carrierProfile'
import type { CarrierSafety, InspectionPage } from '../types/carrierSafety'
import { apiGet } from './client'

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
