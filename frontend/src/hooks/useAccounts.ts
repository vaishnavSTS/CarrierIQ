import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addAccountCarrier,
  disableAccount,
  fetchAccounts,
  markAccountsSeen,
  reactivateAccount,
} from '../api/admin'
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

/** Client sign-ups STS hasn't seen yet (the Accounts pop-up and the nav badge). */
export function useNewAccountCount(): number {
  const { data } = useAccounts()
  return data?.filter((a) => a.is_new).length ?? 0
}

export function useMarkAccountsSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAccountsSeen,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
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
    mutationFn: ({ id, action }: { id: number; action: 'reactivate' | 'disable' }) =>
      action === 'reactivate' ? reactivateAccount(id) : disableAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
}
