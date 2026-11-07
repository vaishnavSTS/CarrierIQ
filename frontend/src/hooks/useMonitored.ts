import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { addMonitored, fetchMonitored, removeMonitored } from '../api/monitored'

const MONITORED_KEY = ['admin', 'monitored'] as const

export function useMonitored() {
  return useQuery({ queryKey: MONITORED_KEY, queryFn: fetchMonitored })
}

export function useAddMonitored() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addMonitored,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MONITORED_KEY }),
  })
}

export function useRemoveMonitored() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeMonitored,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MONITORED_KEY }),
  })
}
