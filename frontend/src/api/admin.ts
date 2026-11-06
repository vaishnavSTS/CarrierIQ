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

export interface StaffInvite {
  email: string
  full_name: string
  role: 'STS_ADMIN' | 'STS_ANALYST'
}

/** A carrier account as a sign-up makes it, without the password and "I agree". */
export interface CarrierInvite {
  full_name: string
  company_name: string
  email: string
  phone: string
  usdot_number: number
}

/** An account an admin added, and whether its "choose your password" email went out. */
export interface AccountInvite {
  account: AdminUser
  invite_emailed: boolean
}

/** Adds an STS admin or analyst; they get an email with a link to choose their password. */
export function inviteStaff(invite: StaffInvite): Promise<AccountInvite> {
  return apiRequest('/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invite),
  })
}

/** Adds a carrier account with its USDOT verified and claimed; they get an email with a link to
 * choose their password, and their free trial starts when they do. */
export function inviteCarrier(invite: CarrierInvite): Promise<AccountInvite> {
  return apiRequest('/admin/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invite),
  })
}

/** Removes an account for good (and its company, if it was the only account). Refused (409)
 * while other records, such as DataQs work or invoices, name it: disable it instead. */
export function deleteAccount(id: number): Promise<null> {
  return apiRequest<null>(`/admin/users/${id}`, { method: 'DELETE' })
}

/** Closes an account; it can no longer log in. */
export function disableAccount(id: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/disable`, { method: 'POST' })
}

/** Links a USDOT number to a client's company, already verified; it shows in their portal. */
/** Free a USDOT number this account claimed, so another carrier account can sign up with it. */
export function releaseClaim(id: number, usdotNumber: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/claims/${usdotNumber}/release`, {
    method: 'POST',
  })
}

export function addAccountCarrier(id: number, usdotNumber: number): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/admin/users/${id}/carriers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdot_number: usdotNumber }),
  })
}
