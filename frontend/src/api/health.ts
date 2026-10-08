import type { HealthResponse } from '../types/health'
import { ApiError, apiRequest } from './client'

/**
 * The health endpoint returns 503 with a normal body when the database is down,
 * so that case is returned as data instead of thrown.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  try {
    return await apiRequest<HealthResponse>('/health')
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return { status: 'degraded', database: 'unavailable' }
    }
    throw error
  }
}
