import { createContext, useContext } from 'react'

import type { Portal } from '../types/auth'

/**
 * Which portal a page is rendered in. The carrier profile pages are shared. Outside the internal
 * portal they show the client view (no STS-internal data, no staff-only controls) and read that
 * portal's endpoints: /portal/carriers/... (a client's own carriers) or /broker/carriers/... (any
 * carrier). Set by AppLayout / PortalLayout / BrokerLayout.
 */
export const PortalModeContext = createContext<Portal>('internal')

/** True on the Try Now pages: a visitor with no account, reading /try/carriers/... */
export const TryModeContext = createContext(false)

export function useIsTryMode(): boolean {
  return useContext(TryModeContext)
}

export function usePortalMode(): Portal {
  return useContext(PortalModeContext)
}

/** True in the client and broker portals: the client view of a carrier, without STS data. */
export function useIsClientPortal(): boolean {
  return usePortalMode() !== 'internal'
}

export function useIsBrokerPortal(): boolean {
  return usePortalMode() === 'broker'
}

export type CarrierApiBase = '/carriers' | '/portal/carriers' | '/broker/carriers' | '/try/carriers'

const API_BASE: Record<Portal, CarrierApiBase> = {
  internal: '/carriers',
  client: '/portal/carriers',
  broker: '/broker/carriers',
}

/** API path prefix for carrier data in the current portal. */
export function useCarrierApiBase(): CarrierApiBase {
  const base = API_BASE[usePortalMode()]
  return useIsTryMode() ? '/try/carriers' : base
}

const PAGE_BASE: Record<Portal, string> = {
  internal: '/carriers',
  client: '/portal/carriers',
  broker: '/broker/carriers',
}

/** Where a carrier's profile page lives in the current portal. */
export function useCarrierPath(): (usdotNumber: number) => string {
  const base = PAGE_BASE[usePortalMode()]
  return (usdot) => `${base}/${usdot}`
}

const SEARCH_PAGE: Record<Portal, string> = {
  internal: '/search',
  client: '/portal/search',
  broker: '/broker',
}

/** Where carrier search lives (and its results) in each portal. */
export function useSearchPath(): string {
  return SEARCH_PAGE[usePortalMode()]
}
