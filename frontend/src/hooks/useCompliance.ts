import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  checkoutCompliance,
  createComplianceRequest,
  fetchCompliancePrices,
  fetchAllRequests,
  fetchCarrierRequests,
  fetchUcrStatus,
  markRequestHandled,
} from '../api/compliance'
import type { ComplianceCheckoutInput, ComplianceServiceId } from '../types/compliance'

export function useUcrStatus(usdotNumber: number) {
  return useQuery({
    queryKey: ['compliance', 'ucr', usdotNumber],
    queryFn: () => fetchUcrStatus(usdotNumber),
    staleTime: 10 * 60_000, // the server caches FMCSA's answer for an hour
    retry: false,
  })
}

export function useCarrierRequests(usdotNumber: number) {
  return useQuery({
    queryKey: ['compliance', 'requests', usdotNumber],
    queryFn: () => fetchCarrierRequests(usdotNumber),
  })
}

export function useCreateComplianceRequest(usdotNumber: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ service, note }: { service: ComplianceServiceId; note: string | null }) =>
      createComplianceRequest(usdotNumber, service, note),
    onSuccess: () => client.invalidateQueries({ queryKey: ['compliance', 'requests'] }),
  })
}

export function useCompliancePrices(usdotNumber: number) {
  return useQuery({
    queryKey: ['compliance', 'prices', usdotNumber],
    queryFn: () => fetchCompliancePrices(usdotNumber),
    staleTime: 10 * 60_000,
  })
}

export function useComplianceCheckout(usdotNumber: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ComplianceCheckoutInput) => checkoutCompliance(usdotNumber, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['compliance', 'requests'] }),
  })
}

export function useAllComplianceRequests(status: 'OPEN' | 'HANDLED' | null) {
  return useQuery({
    queryKey: ['compliance', 'all', status],
    queryFn: () => fetchAllRequests(status),
  })
}

export function useMarkRequestHandled() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: markRequestHandled,
    onSuccess: () => client.invalidateQueries({ queryKey: ['compliance'] }),
  })
}
