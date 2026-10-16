import { useQueries } from '@tanstack/react-query'

import { fetchCarrierAuthority, fetchCarrierProfile, fetchCarrierSafety } from '../../api/carriers'
import { fetchCarrierNetwork } from '../../api/network'
import { useCarrierApiBase } from '../../hooks/usePortalMode'
import type { CarrierAuthority } from '../../types/carrierAuthority'
import type { CarrierProfile } from '../../types/carrierProfile'
import type { CarrierSafety } from '../../types/carrierSafety'
import type { CarrierNetwork } from '../../types/network'

/** Everything the comparison reads for one carrier; parts stay undefined until loaded. */
export interface CarrierFacts {
  usdot: number
  profile?: CarrierProfile
  profileError: Error | null
  safety?: CarrierSafety
  authority?: CarrierAuthority
  network?: CarrierNetwork
}

const STALE = 60_000

/**
 * The same four requests a profile's tabs make, for each compared carrier. The query keys match
 * useCarrierProfile / useCarrierSafety / … so carriers opened before load from cache.
 */
export function useComparison(usdots: number[]): CarrierFacts[] {
  const base = useCarrierApiBase()
  const profiles = useQueries({
    queries: usdots.map((u) => ({
      queryKey: ['carrier-profile', u],
      queryFn: () => fetchCarrierProfile(u, base),
      staleTime: STALE,
      retry: false,
    })),
  })
  // The other three wait for the profile: it loads a new carrier from FMCSA first.
  const ready = (i: number) => profiles[i]?.data !== undefined
  const safety = useQueries({
    queries: usdots.map((u, i) => ({
      queryKey: ['carrier-safety', u],
      queryFn: () => fetchCarrierSafety(u, base),
      staleTime: STALE,
      enabled: ready(i),
    })),
  })
  const authority = useQueries({
    queries: usdots.map((u, i) => ({
      queryKey: ['carrier-authority', u],
      queryFn: () => fetchCarrierAuthority(u, base),
      staleTime: STALE,
      enabled: ready(i),
    })),
  })
  const network = useQueries({
    queries: usdots.map((u, i) => ({
      queryKey: ['carrier-network', u],
      queryFn: () => fetchCarrierNetwork(u, base),
      staleTime: STALE,
      enabled: ready(i),
    })),
  })
  return usdots.map((usdot, i) => ({
    usdot,
    profile: profiles[i]?.data,
    profileError: profiles[i]?.error ?? null,
    safety: safety[i]?.data,
    authority: authority[i]?.data,
    network: network[i]?.data,
  }))
}
