import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { addAccountCarrier, approveAccount, disableAccount, fetchAccounts } from '../api/admin'
import { useMe } from './useAuth'

const ACCOUNTS_KEY = ['admin', 'accounts'] as const

/** Every account (STS admins only; nothing is fetched for anyone else). */
export function useAccounts() {
  const { data: me } = useMe()
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => fetchAccounts(),
    enabled: me?.role === 'STS_ADMIN',
    refetchInterval: 60_000, // new sign-ups show up without reloading
  })
}

export function usePendingAccountCount(): number {
  const { data } = useAccounts()
  return data?.filter((a) => a.status === 'PENDING').length ?? 0
}

export function useAddAccountCarrier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, usdotNumber }: { id: number; usdotNumber: number }) =>
      addAccountCarrier(id, usdotNumber),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
}

export function useAccountAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'disable' }) =>
      action === 'approve' ? approveAccount(id) : disableAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
}
