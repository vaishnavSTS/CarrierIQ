import type { CarrierSearchResponse } from '../types/carrier'
import { apiGet } from './client'

export function searchCarriers(query: string): Promise<CarrierSearchResponse> {
  return apiGet<CarrierSearchResponse>(`/carriers/search?q=${encodeURIComponent(query)}`)
}
