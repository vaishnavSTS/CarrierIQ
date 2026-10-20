import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import {
  useAccountAction,
  useAccounts,
  useAddAccountCarrier,
  useMarkAccountsSeen,
} from '../hooks/useAccounts'
import { useMe } from '../hooks/useAuth'
import type { AdminUser, Brokerage, CarrierContactCheck, UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'
import type { Tone } from '../utils/status'

const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Client owner',
  CLIENT_USER: 'Client viewer',
  BROKER_ADMIN: 'Broker owner',
  BROKER_USER: 'Broker',
}

const STATUS_TONES: Record<AdminUser['status'], Tone> = {
  PENDING: 'warn',
  ACTIVE: 'ok',
  DISABLED: 'down',
}

function UsdotLinks({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return <span className="text-slate-400">none given</span>
  return (
    <>
      {numbers.map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <Link to={`/carriers/${n}`} className="font-mono text-accent-strong hover:underline">
            {n}
          </Link>
        </span>
      ))}
    </>
  )
}

function formatPhone(phone: string | null): string {
  if (!phone) return 'no phone'
  return phone.length === 10
    ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    : phone
}

function MatchBadge({ label, match }: { label: string; match: boolean | null }) {
  if (match === null) return null
  return (
    <StatusBadge
      label={`${label} ${match ? 'matches' : 'differs'}`}
      tone={match ? 'ok' : 'neutral'}
    />
  )
}

/**
 * Sign-up contact details against FMCSA's census record for the USDOT given: a match is strong
 * evidence the person runs that carrier; a difference is common (new phone, a dispatcher) and
 * just means checking another way, e.g. calling the FMCSA number.
 */
function ContactCheck({ check }: { check: CarrierContactCheck }) {
  if (check.legal_name === null) {
    return (
      <div className="mt-2 text-xs text-slate-500">
        USDOT {check.usdot_number} isn’t loaded in CarrierSafetyScan yet.{' '}
        <Link to={`/carriers/${check.usdot_number}`} className="text-accent-strong underline">
          Open it
        </Link>{' '}
        to load FMCSA’s record, then come back to compare contact details.
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span>
        FMCSA record for <span className="text-slate-700">{check.legal_name}</span>:
      </span>
      <MatchBadge label="Company" match={check.company_matches_fmcsa} />
      <MatchBadge label="Phone" match={check.phone_matches_fmcsa} />
      <MatchBadge label="Email" match={check.email_matches_fmcsa} />
      {check.phone_matches_fmcsa === null && check.email_matches_fmcsa === null && (
        <span>(no phone or email on file to compare)</span>
      )}
    </div>
  )
}

/**
 * Pop-up listing client and broker sign-ups STS hasn't seen yet. Sign-ups no longer wait for approval:
 * this is the heads-up, with the FMCSA checks to spot someone claiming a carrier that isn't
 * theirs (then Disable them in the table). "Got it" marks them all as seen.
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
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
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
                <AccountKind portal={a.portal} />
                {a.full_name} · {a.organization_name}
              </div>
              <div className="mt-0.5 text-slate-600">
                {a.email} · {formatPhone(a.phone)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {a.broker ? (
                  <BrokerIdentity broker={a.broker} />
                ) : (
                  <>
                    USDOT: <UsdotLinks numbers={a.usdot_numbers} />
                  </>
                )}{' '}
                · Signed up {formatDateTime(a.created_at)}
              </div>
              {a.carrier_checks.map((check) => (
                <ContactCheck key={check.usdot_number} check={check} />
              ))}
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
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-50"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

/** STS links a carrier to a client (e.g. an account made without one, or a second carrier). */
function AddUsdot({ accountId }: { accountId: number }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const add = useAddAccountCarrier()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 block text-accent-strong hover:underline"
      >
        + Add USDOT
      </button>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const usdot = value.trim()
    if (!/^\d{1,8}$/.test(usdot)) return
    add.mutate(
      { id: accountId, usdotNumber: Number(usdot) },
      {
        onSuccess: () => {
          setValue('')
          setOpen(false)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="mt-1 flex items-center gap-1">
      <input
        autoFocus
        inputMode="numeric"
        placeholder="USDOT"
        aria-label="USDOT number to link"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 rounded border border-slate-300 bg-canvas px-1.5 py-0.5 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={add.isPending || !/^\d{1,8}$/.test(value.trim())}
        className="rounded bg-accent px-2 py-0.5 text-white disabled:opacity-50"
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

function AccountRow({ account, isMe }: { account: AdminUser; isMe: boolean }) {
  const action = useAccountAction()

  return (
    <tr className="align-top">
      <td className="py-2.5 pr-4">
        <div className="font-medium text-slate-900">
          {account.full_name}
          {isMe && <span className="text-slate-500"> (you)</span>}
        </div>
        <div className="text-xs text-slate-500">
          {account.email}
          {account.phone && <> · {formatPhone(account.phone)}</>}
        </div>
      </td>
      <td className="py-2.5 pr-4 text-slate-700">{account.organization_name}</td>
      <td className="py-2.5 pr-4 text-slate-700">{ROLE_LABELS[account.role]}</td>
      <td className="py-2.5 pr-4 text-xs">
        {account.broker ? (
          <BrokerIdentity broker={account.broker} />
        ) : (
          <>
            <UsdotLinks numbers={account.usdot_numbers} />
            {account.carrier_checks.map((check) => (
              <ContactCheck key={check.usdot_number} check={check} />
            ))}
            {account.role.startsWith('CLIENT_') && account.status !== 'DISABLED' && (
              <AddUsdot accountId={account.id} />
            )}
          </>
        )}
      </td>
      <td className="py-2.5 pr-4">
        <StatusBadge label={account.status} tone={STATUS_TONES[account.status]} />
      </td>
      <td className="py-2.5 pr-4 text-xs text-slate-500">
        {account.last_login_at ? formatDateTime(account.last_login_at) : 'never'}
      </td>
      <td className="py-2.5 text-right">
        {account.status === 'ACTIVE' && !isMe && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: account.id, action: 'disable' })}
            className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Disable
          </button>
        )}
        {account.status === 'DISABLED' && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: account.id, action: 'reactivate' })}
            className="rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Re-activate
          </button>
        )}
      </td>
    </tr>
  )
}

/** STS admin: see new sign-ups (pop-up) and manage every account. */
export function AccountsPage() {
  const { data: me } = useMe()
  const { data, isPending, isError } = useAccounts()

  if (me?.role !== 'STS_ADMIN') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Only STS admins manage accounts.</p>
    )
  }

  const newAccounts = data?.filter((a) => a.is_new) ?? []
  const accounts = data ?? []

  return (
    <div className="space-y-6">
      {newAccounts.length > 0 && <NewSignupsDialog accounts={newAccounts} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everyone who can log in. Clients get into their portal as soon as they sign up; disable an
          account to stop it. STS staff accounts are created with the{' '}
          <code className="text-xs">create_staff_user</code> command.
        </p>
      </div>

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-red-700">Couldn’t load accounts.</p>}
      {accounts.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-5">
          <h2 className="text-sm font-semibold text-slate-900">All accounts</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Company</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">USDOT</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Last login</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <AccountRow key={a.id} account={a} isMe={a.id === me.id} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

/** A broker account's brokerage: the MC / USDOT whose broker authority FMCSA confirmed. */
function BrokerIdentity({ broker }: { broker: Brokerage }) {
  return (
    <span className="text-slate-600">
      Broker {broker.docket_number ?? '—'}
      {broker.usdot_number && <> · USDOT {broker.usdot_number}</>}
      <span className="ml-1 text-emerald-700">
        ✓ broker authority ({broker.authority_source === 'MOTUS' ? 'Motus' : 'L&I'})
      </span>
    </span>
  )
}

/** Broker or client, coloured like the header label of their portal. */
function AccountKind({ portal }: { portal: AdminUser['portal'] }) {
  const broker = portal === 'broker'
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
        broker ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
      }`}
    >
      {broker ? 'Broker' : 'Client'}
    </span>
  )
}
