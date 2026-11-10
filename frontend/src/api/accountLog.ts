import type { UserRole } from '../types/auth'
import { apiGet, apiRequest } from './client'

export type AccountEventKind =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'SIGNED_UP'
  | 'EMAIL_CONFIRMED'
  | 'PASSWORD_RESET_ASKED'
  | 'PASSWORD_CHANGED'
  | 'INVITED'
  | 'DISABLED'
  | 'REACTIVATED'
  | 'DELETED'
  | 'CARRIER_LINKED'
  | 'CLAIM_RELEASED'
  | 'SEARCHED'
  | 'CARRIER_VIEWED'

/** Which events the log shows. */
export type LogGroup = 'all' | 'logins' | 'failed' | 'account' | 'activity'

/** One line of the account log (STS admins). */
export interface AccountEvent {
  id: number
  /** When (ISO timestamp) */
  at: string
  event: AccountEventKind
  /** e.g. "Password", "Google", "Wrong password", "USDOT 2465630" */
  detail: string | null
  /** null: no account with that email, or deleted since */
  user_id: number | null
  account_name: string | null
  account_email: string | null
  /** The STS admin who did it; null when the account holder did */
  actor_name: string | null
  ip: string | null
  user_agent: string | null
  /** Activity: the carrier searched for or opened */
  usdot_number?: number | null
  /** Its name, when Carrier Safety Scan has it */
  carrier_name?: string | null
  /** Activity: the carrier page tab opened, e.g. "safety" */
  page?: string | null
}

/** One account, above its history. */
export interface AccountSummary {
  id: number
  full_name: string
  email: string
  organization_name: string | null
  role: UserRole
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
  created_at: string
  last_login_at: string | null
  logins_30d: number
  failed_logins_30d: number
  last_failed_login_at: string | null
}

export interface AccountLogPage {
  /** Newest first */
  events: AccountEvent[]
  /** Older events: ask again with before = the last id */
  has_more: boolean
  /** Set when the log is for one account */
  account: AccountSummary | null
}

export interface AccountLogFilter {
  userId?: number
  group: LogGroup
  query: string
}

export function fetchAccountLog(
  filter: AccountLogFilter,
  before?: number,
): Promise<AccountLogPage> {
  const params = new URLSearchParams({ group: filter.group, limit: '100' })
  if (filter.userId) params.set('user_id', String(filter.userId))
  if (filter.query.trim()) params.set('q', filter.query.trim())
  if (before) params.set('before', String(before))
  return apiGet<AccountLogPage>(`/admin/account-log?${params}`)
}

/**
 * The carrier page reports each tab the logged-in person opens, for their account history. Never
 * gets in the way: a failed report is ignored.
 */
export function reportCarrierView(usdotNumber: number, tab: string): void {
  apiRequest<null>('/activity/carrier-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usdot_number: usdotNumber, tab }),
  }).catch(() => undefined)
}
