import { Search, Truck, UserPlus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import { AccountActions } from '../features/accounts/AccountActions'
import {
  AddCarrierForm,
  AddedNote,
  AddStaffForm,
  type AddedAccount,
  type AddKind,
} from '../features/accounts/AddAccountForms'
import { useAccounts, useAddAccountCarrier, useMarkAccountsSeen } from '../hooks/useAccounts'
import { useMe } from '../hooks/useAuth'
import type { AdminUser, Brokerage, CarrierContactCheck, UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'
import type { Tone } from '../utils/status'

const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Carrier owner',
  CLIENT_USER: 'Carrier viewer',
  BROKER_ADMIN: 'Broker owner',
  BROKER_USER: 'Broker',
  INSURANCE_AGENT: 'Insurance agent',
}

const STATUS: Record<AdminUser['status'], { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  ACTIVE: { label: 'Active', tone: 'ok' },
  DISABLED: { label: 'Disabled', tone: 'down' },
}

type Tab = 'all' | 'carriers' | 'brokers' | 'staff'

const TABS: { id: Tab; label: string; matches: (a: AdminUser) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'carriers', label: 'Carriers', matches: (a) => a.portal === 'client' },
  { id: 'brokers', label: 'Brokers & insurance', matches: (a) => a.portal === 'broker' },
  { id: 'staff', label: 'STS staff', matches: (a) => a.portal === 'internal' },
]

/** Name, email, company, phone or USDOT contains what was typed (case and punctuation ignored). */
function matchesSearch(account: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const text = [account.full_name, account.email, account.organization_name].join(' ').toLowerCase()
  if (text.includes(q)) return true
  if (digits.length < 3) return false
  return (
    (account.phone ?? '').includes(digits) ||
    account.usdot_numbers.some((n) => String(n).includes(digits)) ||
    String(account.broker?.usdot_number ?? '').includes(digits) ||
    (account.broker?.docket_number ?? '').includes(digits)
  )
}

function formatPhone(phone: string | null): string {
  if (!phone) return ''
  return phone.length === 10
    ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    : phone
}

/**
 * One line comparing the sign-up's company, phone and email with FMCSA's record for the USDOT:
 * a match is strong evidence the person runs that carrier; a difference is common (new phone, a
 * dispatcher) and just means checking another way, e.g. calling the FMCSA number.
 */
function FmcsaCheck({ check }: { check: CarrierContactCheck }) {
  if (check.legal_name === null) {
    return (
      <p className="text-xs text-slate-500">
        Not loaded yet:{' '}
        <Link to={`/carriers/${check.usdot_number}`} className="text-accent-strong underline">
          open it
        </Link>{' '}
        to compare with FMCSA.
      </p>
    )
  }
  const results = [
    ['company', check.company_matches_fmcsa],
    ['phone', check.phone_matches_fmcsa],
    ['email', check.email_matches_fmcsa],
  ] as const
  const differs = results.filter(([, m]) => m === false).map(([label]) => label)
  const matches = results.filter(([, m]) => m === true).map(([label]) => label)
  return (
    <p className="text-xs text-slate-500">
      FMCSA: <span className="text-slate-700">{check.legal_name}</span>
      {differs.length > 0 && <span className="text-amber-700"> · {differs.join(', ')} differ</span>}
      {matches.length > 0 && (
        <span className="text-emerald-700"> · {matches.join(', ')} match</span>
      )}
    </p>
  )
}

/** STS links another carrier to a client's company, verified. */
function AddUsdot({ accountId }: { accountId: number }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const add = useAddAccountCarrier()
  const valid = /^\d{1,8}$/.test(value.trim())

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent-strong hover:underline"
      >
        + Add USDOT
      </button>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    add.mutate(
      { id: accountId, usdotNumber: Number(value.trim()) },
      {
        onSuccess: () => {
          setValue('')
          setOpen(false)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1 text-xs">
      <input
        autoFocus
        inputMode="numeric"
        placeholder="USDOT"
        aria-label="USDOT number to link"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 rounded border border-slate-300 bg-canvas px-1.5 py-0.5 font-mono"
      />
      <button
        type="submit"
        disabled={add.isPending || !valid}
        className="rounded bg-cta px-2 py-0.5 text-cta-ink hover:bg-cta-hover disabled:opacity-50"
      >
        Link
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-1 text-slate-500">
        Cancel
      </button>
      {add.isError && <span className="text-red-700">{add.error.message}</span>}
    </form>
  )
}

/**
 * A carrier account's USDOT numbers: verified or not (Verify confirms it is theirs, needed for
 * DataQs), whether this account holds the claim, and FMCSA's record against what they gave.
 */
function CarrierCell({ account }: { account: AdminUser }) {
  const verify = useAddAccountCarrier()
  const active = account.status !== 'DISABLED'
  const claimed = account.claimed_usdot_numbers ?? []
  return (
    <div className="space-y-1.5">
      {account.usdot_numbers.length === 0 && (
        <p className="text-xs text-slate-400">No USDOT given</p>
      )}
      {account.usdot_numbers.map((n) => {
        const verified = account.verified_usdot_numbers.includes(n)
        const check = account.carrier_checks.find((c) => c.usdot_number === n)
        return (
          <div key={n} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                to={`/carriers/${n}`}
                className="font-mono text-sm text-accent-strong hover:underline"
              >
                {n}
              </Link>
              <StatusBadge
                label={verified ? 'Verified' : 'Not verified'}
                tone={verified ? 'ok' : 'warn'}
              />
              {claimed.includes(n) && <span className="text-xs text-slate-500">· claimed</span>}
              {!verified && active && (
                <button
                  type="button"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate({ id: account.id, usdotNumber: n })}
                  title="Confirm this carrier belongs to the client. Needed before they can use DataQs."
                  className="rounded bg-cta px-2 py-0.5 text-xs font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
                >
                  {verify.isPending && verify.variables?.usdotNumber === n
                    ? 'Verifying…'
                    : 'Verify'}
                </button>
              )}
            </div>
            {check && <FmcsaCheck check={check} />}
          </div>
        )
      })}
      {verify.isError && <p className="text-xs text-red-700">{verify.error.message}</p>}
      {active && <AddUsdot accountId={account.id} />}
    </div>
  )
}

/** A broker account's brokerage: the MC / USDOT whose broker authority FMCSA confirmed. */
function BrokerIdentity({ broker }: { broker: Brokerage }) {
  if (broker.license_number) {
    return (
      <p className="text-xs text-slate-600">
        NPN {broker.license_number}
        <span className="block text-amber-700">As given at sign-up, not checked</span>
      </p>
    )
  }
  return (
    <p className="text-xs text-slate-600">
      {broker.docket_number ?? '—'}
      {broker.usdot_number && <> · USDOT {broker.usdot_number}</>}
      <span className="block text-emerald-700">
        ✓ Broker authority ({broker.authority_source === 'MOTUS' ? 'Motus' : 'L&I'})
      </span>
    </p>
  )
}

function AccountRow({
  account,
  isMe,
  onlyInCompany,
}: {
  account: AdminUser
  isMe: boolean
  onlyInCompany: boolean
}) {
  const status = STATUS[account.status]
  return (
    <tr className={`align-top ${account.status === 'DISABLED' ? 'opacity-60' : ''}`}>
      <td className="py-3 pr-4">
        <div className="font-medium text-slate-900">
          {account.full_name}
          {isMe && <span className="font-normal text-slate-500"> (you)</span>}
        </div>
        <div className="text-xs text-slate-500">{account.email}</div>
        {account.phone && (
          <div className="text-xs text-slate-500">{formatPhone(account.phone)}</div>
        )}
      </td>
      <td className="py-3 pr-4">
        <div className="text-slate-800">{account.organization_name}</div>
        <div className="text-xs text-slate-500">{ROLE_LABELS[account.role]}</div>
      </td>
      <td className="py-3 pr-4">
        {account.broker ? (
          <BrokerIdentity broker={account.broker} />
        ) : account.portal === 'client' ? (
          <CarrierCell account={account} />
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <StatusBadge label={status.label} tone={status.tone} />
      </td>
      <td className="whitespace-nowrap py-3 pr-4 text-xs text-slate-500">
        {account.last_login_at ? formatDateTime(account.last_login_at) : 'Never'}
      </td>
      <td className="py-3 text-right">
        {!isMe && (
          <AccountActions
            account={account}
            withCompany={onlyInCompany && account.portal !== 'internal'}
          />
        )}
      </td>
    </tr>
  )
}

/**
 * Pop-up listing client and broker sign-ups STS hasn't seen yet. Sign-ups don't wait for approval:
 * this is the heads-up, with the FMCSA checks to spot someone claiming a carrier that isn't
 * theirs (then disable them in the table). "Got it" marks them all as seen.
 */
function NewSignupsDialog({ accounts }: { accounts: AdminUser[] }) {
  const markSeen = useMarkAccountsSeen()
  const count = accounts.length

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-signups-title"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-700">
            <UserPlus className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="new-signups-title" className="text-lg font-semibold text-slate-950">
              {count === 1 ? '1 new user signed up' : `${count} new users signed up`}
            </h2>
            <p className="text-sm text-slate-500">
              They can already use their portal. Check the details against FMCSA below.
            </p>
          </div>
        </div>
        <ul className="mt-5 space-y-3">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-canvas p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    a.portal === 'broker' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {a.portal === 'broker' ? 'Broker' : 'Carrier'}
                </span>
                {a.full_name} · {a.organization_name}
              </div>
              <div className="mt-0.5 text-slate-600">
                {a.email}
                {a.phone && <> · {formatPhone(a.phone)}</>} · signed up{' '}
                {formatDateTime(a.created_at)}
              </div>
              <div className="mt-2">
                {a.broker ? <BrokerIdentity broker={a.broker} /> : <CarrierCell account={a} />}
              </div>
            </li>
          ))}
        </ul>
        {markSeen.isError && <p className="mt-3 text-sm text-red-700">{markSeen.error.message}</p>}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            autoFocus
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate()}
            className="rounded-md bg-cta px-4 py-2 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active disabled:opacity-50"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

/** STS admin: add carriers and staff, see new sign-ups (pop-up) and manage every account. */
export function AccountsPage() {
  const { data: me } = useMe()
  const { data, isPending, isError } = useAccounts()
  const [adding, setAdding] = useState<AddKind | null>(null)
  const [added, setAdded] = useState<AddedAccount | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')

  if (me?.role !== 'STS_ADMIN') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Only STS admins manage accounts.</p>
    )
  }

  const accounts = data ?? []
  const newAccounts = accounts.filter((a) => a.is_new)
  const perCompany = new Map<number, number>()
  for (const a of accounts) {
    perCompany.set(a.organization_id, (perCompany.get(a.organization_id) ?? 0) + 1)
  }
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]
  const shown = accounts.filter((a) => current.matches(a) && matchesSearch(a, query))

  function startAdding(kind: AddKind) {
    setAdding(kind)
    setAdded(null)
  }

  return (
    <div className="space-y-5">
      {newAccounts.length > 0 && <NewSignupsDialog accounts={newAccounts} />}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everyone who can log in. Carriers and brokers can use their portal as soon as they sign
            up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startAdding('carrier')}
            className="flex items-center gap-1.5 rounded-md bg-cta px-3 py-2 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active"
          >
            <Truck className="size-4" aria-hidden />
            Add carrier
          </button>
          <button
            type="button"
            onClick={() => startAdding('staff')}
            className="flex items-center gap-1.5 rounded-md bg-surface px-3 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <UserPlus className="size-4" aria-hidden />
            Add staff member
          </button>
        </div>
      </div>

      {added && <AddedNote result={added} onClose={() => setAdded(null)} />}

      {adding && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {adding === 'carrier' ? 'Add a carrier account' : 'Add an STS staff member'}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {adding === 'carrier'
                  ? 'The same details as the carrier sign-up. They get an email to choose their own password.'
                  : 'They get an email to choose their own password, or can sign in with Google.'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAdding(null)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {adding === 'carrier' ? (
            <AddCarrierForm
              key="carrier"
              onCancel={() => setAdding(null)}
              onDone={(result) => {
                setAdded(result)
                setAdding(null)
              }}
            />
          ) : (
            <AddStaffForm
              key="staff"
              onCancel={() => setAdding(null)}
              onDone={(result) => {
                setAdded(result)
                setAdding(null)
              }}
            />
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div role="tablist" aria-label="Account type" className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const count = accounts.filter(t.matches).length
              const selected = t.id === tab
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    selected
                      ? 'bg-accent-soft font-medium text-accent-strong'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs tabular-nums text-slate-500">{count}</span>
                </button>
              )
            })}
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search accounts</span>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search name, email, company, USDOT"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-canvas py-1.5 pl-8 pr-2.5 text-sm text-slate-900 focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {isPending && <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>}
        {isError && <p className="px-5 py-8 text-sm text-red-700">Couldn’t load accounts.</p>}
        {!isPending && !isError && shown.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {query ? `No accounts match “${query}”.` : 'No accounts here yet.'}
          </p>
        )}
        {shown.length > 0 && (
          <div className="overflow-x-auto px-5 pb-2">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2.5 pr-4 font-medium">Name</th>
                  <th className="py-2.5 pr-4 font-medium">Company and role</th>
                  <th className="py-2.5 pr-4 font-medium">Carrier / brokerage</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">Last login</th>
                  <th className="w-10 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    isMe={a.id === me.id}
                    onlyInCompany={perCompany.get(a.organization_id) === 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
