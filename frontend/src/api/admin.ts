import type { AdminUser, UserStatus } from '../types/auth'
import { apiGet, apiRequest } from './client'

/** STS admin only: every account, newest first, optionally only one status. */
export function fetchAccounts(status?: UserStatus): Promise<AdminUser[]> {
  return apiGet<AdminUser[]>(`/admin/users${status ? `?status=${status}` : ''}`)
}

/** Lets a disabled account log in again. */
export function reactivateAccount(id: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/reactivate`, { method: 'POST' })
}

/** Dismisses the "new sign-up" pop-up: every new account is marked as seen. */
export function markAccountsSeen(): Promise<{ marked: number }> {
  return apiRequest<{ marked: number }>('/admin/users/seen', { method: 'POST' })
}

/** Closes an account; it can no longer log in. */
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
