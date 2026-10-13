import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  completeGoogleSignup,
  fetchAuthOptions,
  fetchGoogleSignup,
  fetchMe,
  fetchPortalOverview,
  login,
  logout,
  register,
} from '../api/auth'
import type { GoogleSignupInput, Portal, RegisterInput } from '../types/auth'

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

export function useRegister() {
  return useMutation({ mutationFn: (input: RegisterInput) => register(input) })
}

export function usePortalOverview() {
  return useQuery({ queryKey: ['portal', 'overview'], queryFn: fetchPortalOverview })
}

/** The first page each portal opens on. */
export function homeFor(portal: Portal): string {
  return portal === 'internal' ? '/dashboard' : '/portal'
}

export function useAuthOptions() {
  return useQuery({ queryKey: ['auth', 'options'], queryFn: fetchAuthOptions, staleTime: Infinity })
}

export function useGoogleSignup() {
  return useQuery({ queryKey: ['auth', 'google-signup'], queryFn: fetchGoogleSignup })
}

export function useCompleteGoogleSignup() {
  return useMutation({ mutationFn: (input: GoogleSignupInput) => completeGoogleSignup(input) })
}
