import { createContext, useContext } from 'react'

import type { Portal } from '../types/auth'

/**
 * Which portal a page is rendered in. The carrier profile pages are shared: in the client
 * portal they read the client endpoints (/portal/carriers/..., own verified carriers only, no
 * STS-internal data) and hide staff-only controls. Set by AppLayout / PortalLayout.
 */
export const PortalModeContext = createContext<Portal>('internal')

export function useIsClientPortal(): boolean {
  return useContext(PortalModeContext) === 'client'
}

/** API path prefix for carrier data in the current portal. */
export function useCarrierApiBase(): CarrierApiBase {
  return useIsClientPortal() ? '/portal/carriers' : '/carriers'
}

export type CarrierApiBase = '/carriers' | '/portal/carriers'

/** Where a carrier's profile page lives in the current portal. */
export function useCarrierPath(): (usdotNumber: number) => string {
  const client = useIsClientPortal()
  return (usdot) => (client ? `/portal/carriers/${usdot}` : `/carriers/${usdot}`)
}
