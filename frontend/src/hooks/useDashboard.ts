import { useQuery } from '@tanstack/react-query'

import { fetchDashboard } from '../api/dashboard'

/** Totals and the newest signals, refreshed every 15 seconds while the dashboard is open. */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, refetchInterval: 15_000 })
}
