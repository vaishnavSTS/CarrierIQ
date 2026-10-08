export type ComponentStatus = 'ok' | 'degraded' | 'unavailable'

export interface HealthResponse {
  status: ComponentStatus
  database: ComponentStatus
}
