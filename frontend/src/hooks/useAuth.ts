import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  completeBrokerGoogleSignup,
  completeGoogleSignup,
  fetchAuthOptions,
  fetchBrokerOverview,
  fetchGoogleSignup,
  fetchMe,
  fetchPortalOverview,
  login,
  logout,
  register,
  registerBroker,
} from '../api/auth'
import type {
  BrokerGoogleSignupInput,
  BrokerRegisterInput,
  GoogleSignupInput,
  Portal,
  RegisterInput,
  User,
} from '../types/auth'

export const ME_KEY = ['auth', 'me'] as const

/** Who is logged in. `data` is null when nobody is. */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000 })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (user) => {
      // Drop anything cached for a previous user before showing this one's pages.
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
    },
  })
}

/** Sign-up logs the client in: show their portal straight away. */
export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) => register(input),
    onSuccess: (user) => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
    },
  })
}

/** Broker sign-up also logs in: the broker portal opens straight away. */
export function useRegisterBroker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BrokerRegisterInput) => registerBroker(input),
    onSuccess: (user: User) => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
    },
  })
}

export function useBrokerOverview() {
  return useQuery({ queryKey: ['broker', 'overview'], queryFn: fetchBrokerOverview })
}

export function useCompleteBrokerGoogleSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BrokerGoogleSignupInput) => completeBrokerGoogleSignup(input),
    onSuccess: (user: User) => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
    },
  })
}

export function usePortalOverview(enabled = true) {
  return useQuery({ queryKey: ['portal', 'overview'], queryFn: fetchPortalOverview, enabled })
}

/** The first page each portal opens on. */
export function homeFor(portal: Portal): string {
  return { internal: '/dashboard', client: '/portal', broker: '/broker' }[portal]
}

export function useAuthOptions() {
  return useQuery({ queryKey: ['auth', 'options'], queryFn: fetchAuthOptions, staleTime: Infinity })
}

export function useGoogleSignup() {
  return useQuery({ queryKey: ['auth', 'google-signup'], queryFn: fetchGoogleSignup })
}

export function useCompleteGoogleSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GoogleSignupInput) => completeGoogleSignup(input),
    onSuccess: (user) => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, user)
    },
  })
}
