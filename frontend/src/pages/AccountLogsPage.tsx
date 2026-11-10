import { ArrowLeft, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { AccountEvent, AccountEventKind, AccountSummary, LogGroup } from '../api/accountLog'
import { StatusBadge } from '../components/StatusBadge'
import { useAccountLog } from '../hooks/useAccountLog'
import { useMe } from '../hooks/useAuth'
import type { UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'
import type { Tone } from '../utils/status'
import { describeDevice } from '../utils/userAgent'

const EVENTS: Record<AccountEventKind, { label: string; tone: Tone }> = {
  LOGIN: { label: 'Logged in', tone: 'ok' },
  LOGOUT: { label: 'Logged out', tone: 'neutral' },
  LOGIN_FAILED: { label: 'Login failed', tone: 'down' },
  SIGNED_UP: { label: 'Signed up', tone: 'pending' },
  EMAIL_CONFIRMED: { label: 'Email confirmed', tone: 'pending' },
  PASSWORD_RESET_ASKED: { label: 'Asked for a reset link', tone: 'warn' },
  PASSWORD_CHANGED: { label: 'Password set', tone: 'pending' },
  INVITED: { label: 'Added by STS', tone: 'pending' },
  DISABLED: { label: 'Disabled', tone: 'down' },
  REACTIVATED: { label: 'Reactivated', tone: 'ok' },
  DELETED: { label: 'Deleted', tone: 'down' },
  CARRIER_LINKED: { label: 'USDOT linked', tone: 'pending' },
  CLAIM_RELEASED: { label: 'Claim released', tone: 'warn' },
  SEARCHED: { label: 'Searched', tone: 'pending' },
  CARRIER_VIEWED: { label: 'Opened carrier', tone: 'neutral' },
}

const GROUPS: { id: LogGroup; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'logins', label: 'Logins' },
  { id: 'failed', label: 'Failed logins' },
  { id: 'activity', label: 'Activity' },
  { id: 'account', label: 'Account changes' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Carrier owner',
  CLIENT_USER: 'Carrier viewer',
  BROKER_ADMIN: 'Broker owner',
  BROKER_USER: 'Broker',
  INSURANCE_AGENT: 'Insurance agent',
}

/** What's typed, once typing pauses. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${alert ? 'text-red-700' : 'text-slate-900'}`}>
        {value}
      </dd>
    </div>
  )
}

/** The account whose history this is, with its login numbers. */
function AccountCard({ account }: { account: AccountSummary }) {
  const status: Tone =
    account.status === 'ACTIVE' ? 'ok' : account.status === 'DISABLED' ? 'down' : 'warn'
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{account.full_name}</h2>
          <p className="text-sm text-slate-600">
            {account.email}
            {account.organization_name && <> · {account.organization_name}</>} ·{' '}
            {ROLE_LABELS[account.role]}
          </p>
        </div>
        <StatusBadge label={account.status.toLowerCase()} tone={status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Account made" value={formatDateTime(account.created_at)} />
        <Stat
          label="Last login"
          value={account.last_login_at ? formatDateTime(account.last_login_at) : 'Never'}
        />
        <Stat label="Logins, last 30 days" value={String(account.logins_30d)} />
        <Stat
          label="Failed logins, last 30 days"
          value={String(account.failed_logins_30d)}
          alert={account.failed_logins_30d > 0}
        />
        <Stat
          label="Last failed login"
          value={
            account.last_failed_login_at ? formatDateTime(account.last_failed_login_at) : 'None'
          }
        />
      </dl>
    </section>
  )
}

/** The carrier page's tabs, by the name the person saw. */
const TAB_NAMES: Record<string, string> = {
  identity: 'Overview',
  authority: 'Authority',
  insurance: 'Insurance',
  safety: 'Inspections',
  equipment: 'Equipment',
  network: 'Linked carriers',
  chameleon: 'Chameleon check',
  'safety-score-report': 'Safety Score Report',
  compliance: 'Compliance',
  invoices: 'Invoices',
  intelligence: 'Intelligence',
  timeline: 'History',
}

/** What the entry says: for activity, the carrier (linked) and the tab opened. */
function EventDetail({ event }: { event: AccountEvent }) {
  const usdot = event.usdot_number
  const carrier = usdot ? (
    <Link
      to={`/carriers/${usdot}${event.page && event.page !== 'identity' ? `?tab=${event.page}` : ''}`}
      className="font-medium text-accent-strong hover:underline"
    >
      {event.carrier_name ?? `USDOT ${usdot}`}
    </Link>
  ) : null
  if (event.event === 'CARRIER_VIEWED') {
    return (
      <>
        {carrier}
        <div className="text-xs text-slate-500">
          {event.carrier_name && <span className="font-mono">USDOT {usdot} · </span>}
          {TAB_NAMES[event.page ?? ''] ?? event.page} tab
        </div>
      </>
    )
  }
  if (event.event === 'SEARCHED') {
    return (
      <>
        {event.detail}
        {carrier && <div className="text-xs">{carrier}</div>}
      </>
    )
  }
  return <>{event.detail ?? <span className="text-slate-400">—</span>}</>
}

function EventRow({ event, oneAccount }: { event: AccountEvent; oneAccount: boolean }) {
  const kind = EVENTS[event.event] ?? { label: event.event, tone: 'neutral' as Tone }
  const device = describeDevice(event.user_agent)
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-slate-600">
        {formatDateTime(event.at)}
      </td>
      {!oneAccount && (
        <td className="py-2.5 pr-4">
          {event.user_id ? (
            <Link
              to={`/account-logs?account=${event.user_id}`}
              className="font-medium text-accent-strong hover:underline"
            >
              {event.account_name}
            </Link>
          ) : (
            <span className="text-slate-500">
              {event.event === 'DELETED' ? 'Deleted account' : 'No account'}
            </span>
          )}
          <div className="text-xs text-slate-500">{event.account_email ?? '—'}</div>
        </td>
      )}
      <td className="py-2.5 pr-4">
        <StatusBadge label={kind.label} tone={kind.tone} />
      </td>
      <td className="py-2.5 pr-4 text-slate-700">
        <EventDetail event={event} />
        {event.actor_name && (
          <div className="text-xs text-slate-500">By {event.actor_name} (STS)</div>
        )}
      </td>
      <td className="py-2.5 text-xs text-slate-600">
        <div className="font-mono">{event.ip ?? '—'}</div>
        {device && (
          <div className="text-slate-500" title={event.user_agent ?? undefined}>
            {device}
          </div>
        )}
      </td>
    </tr>
  )
}

/**
 * STS admins: every login, failed login, logout and account change, for all accounts or (with
 * ?account=<id>) one account's history.
 */
export function AccountLogsPage() {
  const { data: me } = useMe()
  const [params] = useSearchParams()
  const accountId = Number(params.get('account')) || undefined
  const [group, setGroup] = useState<LogGroup>('all')
  const [typed, setTyped] = useState('')
  const query = useSettled(typed)
  const log = useAccountLog({ userId: accountId, group, query })

  if (me?.role !== 'STS_ADMIN') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">
        Only STS admins can see the account logs.
      </p>
    )
  }

  const pages = log.data?.pages ?? []
  const events = pages.flatMap((p) => p.events)
  const account = pages[0]?.account ?? null

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={accountId ? '/account-logs' : '/accounts'}
          className="inline-flex items-center gap-1 text-sm text-accent-strong hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {accountId ? 'All accounts' : 'Accounts'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {accountId ? 'Account history' : 'Account logs'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {accountId
            ? 'Every login, failed login, change to this account, search and carrier opened, newest first.'
            : 'Every login, failed login, logout, account change, search and carrier opened, for every account. Newest first.'}
        </p>
      </div>

      {account && <AccountCard account={account} />}

      <section className="rounded-2xl border border-slate-200 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div role="tablist" aria-label="Which events" className="flex flex-wrap gap-1">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === group}
                onClick={() => setGroup(g.id)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  g.id === group
                    ? 'bg-accent-soft font-medium text-accent-strong'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          {!accountId && (
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Search the log</span>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search email, name or IP"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-canvas py-1.5 pl-8 pr-2.5 text-sm text-slate-900 focus:border-accent focus:outline-none"
              />
            </label>
          )}
        </div>

        {log.isPending && <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>}
        {log.isError && (
          <p className="px-5 py-8 text-sm text-red-700">
            Couldn’t load the log: {log.error.message}
          </p>
        )}
        {!log.isPending && !log.isError && events.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {query ? `Nothing in the log matches “${query}”.` : 'Nothing in the log here yet.'}
          </p>
        )}
        {events.length > 0 && (
          <div className="overflow-x-auto px-5 pb-2">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2.5 pr-4 font-medium">When</th>
                  {!accountId && <th className="py-2.5 pr-4 font-medium">Account</th>}
                  <th className="py-2.5 pr-4 font-medium">What happened</th>
                  <th className="py-2.5 pr-4 font-medium">Details</th>
                  <th className="py-2.5 font-medium">From (IP and device)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} oneAccount={Boolean(accountId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.hasNextPage && (
          <div className="border-t border-slate-100 px-5 py-3 text-center">
            <button
              type="button"
              onClick={() => void log.fetchNextPage()}
              disabled={log.isFetchingNextPage}
              className="rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              {log.isFetchingNextPage ? 'Loading…' : 'Show older'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
