import type { CarrierSearchResponse } from '../types/carrier'
import type { CarrierProfile } from '../types/carrierProfile'
import { apiGet } from './client'

export function searchCarriers(query: string): Promise<CarrierSearchResponse> {
  return apiGet<CarrierSearchResponse>(`/carriers/search?q=${encodeURIComponent(query)}`)
}

export function fetchCarrierProfile(usdotNumber: number): Promise<CarrierProfile> {
  return apiGet<CarrierProfile>(`/carriers/${usdotNumber}`)
}
