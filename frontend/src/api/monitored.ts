import { apiGet, apiRequest } from './client'

/** A USDOT number on the Admin Monitored DOTs list (STS admins). */
export interface MonitoredCarrier {
  usdot_number: number
  /** null: no longer loaded in Carrier Safety Scan */
  legal_name: string | null
  dba_name: string | null
  /** When it was added (ISO timestamp) */
  added_at: string
  /** The admin who added it; null once that account is deleted */
  added_by: string | null
}

/** Every monitored USDOT, newest first. */
export function fetchMonitored(): Promise<MonitoredCarrier[]> {
  return apiGet<MonitoredCarrier[]>('/admin/monitored')
}

/** Starts monitoring a USDOT; FMCSA must know it, and it can't be on the list already. */
export function addMonitored(usdotNumber: number): Promise<MonitoredCarrier> {
  return apiRequest<MonitoredCarrier>('/admin/monitored', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdot_number: usdotNumber }),
  })
}

export function removeMonitored(usdotNumber: number): Promise<null> {
  return apiRequest<null>(`/admin/monitored/${usdotNumber}`, { method: 'DELETE' })
}
