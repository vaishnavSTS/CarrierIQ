import type { AdminUser, UserStatus } from '../types/auth'
import { apiGet, apiRequest } from './client'

/** STS admin only: every account, newest first, optionally only one status. */
export function fetchAccounts(status?: UserStatus): Promise<AdminUser[]> {
  return apiGet<AdminUser[]>(`/admin/users${status ? `?status=${status}` : ''}`)
}

/** Opens the account and confirms the USDOT numbers its company gave. */
export function approveAccount(id: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/approve`, { method: 'POST' })
}

/** Rejects a sign-up or closes an account; it can no longer log in. */
export function disableAccount(id: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/disable`, { method: 'POST' })
}

/** Links a USDOT number to a client's company, already verified; it shows in their portal. */
export function addAccountCarrier(id: number, usdotNumber: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/carriers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdot_number: usdotNumber }),
  })
}
