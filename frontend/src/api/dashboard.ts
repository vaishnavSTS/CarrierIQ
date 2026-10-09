import type { Dashboard } from '../types/dashboard'
import { apiGet } from './client'

export function fetchDashboard(): Promise<Dashboard> {
  return apiGet<Dashboard>('/dashboard')
}
