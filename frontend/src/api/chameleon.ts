import type { CarrierApiBase } from '../hooks/usePortalMode'
import type { ChameleonCheck } from '../types/chameleon'
import { apiGet } from './client'

export function fetchChameleonCheck(
  usdotNumber: number,
  base: CarrierApiBase = '/carriers',
): Promise<ChameleonCheck> {
  return apiGet<ChameleonCheck>(`${base}/${usdotNumber}/chameleon`)
}
