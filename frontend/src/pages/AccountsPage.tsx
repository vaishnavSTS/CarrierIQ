import { Check, Inbox, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import { useAccountAction, useAccounts, useAddAccountCarrier } from '../hooks/useAccounts'
import { useMe } from '../hooks/useAuth'
import type { AdminUser, CarrierContactCheck, UserRole } from '../types/auth'
import { formatDateTime } from '../utils/format'
import type { Tone } from '../utils/status'

const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Client owner',
  CLIENT_USER: 'Client viewer',
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
        USDOT {check.usdot_number} isn’t loaded in CarrierIQ yet.{' '}
        <Link to={`/carriers/${check.usdot_number}`} className="text-accent-strong underline">
          Open it
        </Link>{' '}
        to load FMCSA’s record, then come back to compare contact details.
      </div>
    )
  }
  const noFmcsaContact = check.phone_matches_fmcsa === null && check.email_matches_fmcsa === null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span>
        FMCSA record for <span className="text-slate-700">{check.legal_name}</span>:
      </span>
      {noFmcsaContact ? (
        <span>no phone or email on file to compare.</span>
      ) : (
        <>
          <MatchBadge label="Phone" match={check.phone_matches_fmcsa} />
          <MatchBadge label="Email" match={check.email_matches_fmcsa} />
        </>
      )}
    </div>
  )
}

/** One sign-up waiting for approval. Reject needs a second click, so it is never a slip. */
function PendingCard({ account }: { account: AdminUser }) {
  const action = useAccountAction()
  const [confirmReject, setConfirmReject] = useState(false)
  const busy = action.isPending

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-amber-600/30 bg-amber-50 p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium text-slate-900">
          {account.full_name} · {account.organization_name}
        </div>
        <div className="mt-0.5 text-slate-600">
          {account.email} · {formatPhone(account.phone)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          USDOT: <UsdotLinks numbers={account.usdot_numbers} /> · Signed up{' '}
          {formatDateTime(account.created_at)}
        </div>
        {account.carrier_checks.map((check) => (
          <ContactCheck key={check.usdot_number} check={check} />
        ))}
        {action.isError && <div className="mt-1 text-xs text-red-700">{action.error.message}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => action.mutate({ id: account.id, action: 'approve' })}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="size-4" aria-hidden />
          Approve
        </button>
        {confirmReject ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => action.mutate({ id: account.id, action: 'disable' })}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-gray-950 hover:bg-red-700 disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setConfirmReject(false)}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmReject(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
            Reject
          </button>
        )}
      </div>
    </li>
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
        <UsdotLinks numbers={account.usdot_numbers} />
        {!account.role.startsWith('STS_') && account.status !== 'DISABLED' && (
          <AddUsdot accountId={account.id} />
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
            onClick={() => action.mutate({ id: account.id, action: 'approve' })}
            className="rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Re-activate
          </button>
        )}
      </td>
    </tr>
  )
}

/** STS admin: approve client sign-ups and manage every account. */
export function AccountsPage() {
  const { data: me } = useMe()
  const { data, isPending, isError } = useAccounts()

  if (me?.role !== 'STS_ADMIN') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Only STS admins manage accounts.</p>
    )
  }

  const pending = data?.filter((a) => a.status === 'PENDING') ?? []
  const others = data?.filter((a) => a.status !== 'PENDING') ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Approve client sign-ups and manage who can log in. STS staff accounts are created with the{' '}
          <code className="text-xs">create_staff_user</code> command.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Waiting for approval{pending.length > 0 && ` (${pending.length})`}
        </h2>
        {isPending && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        {isError && <p className="mt-3 text-sm text-red-700">Couldn’t load accounts.</p>}
        {data && pending.length === 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Inbox className="size-4" aria-hidden />
            No sign-ups waiting.
          </p>
        )}
        {pending.length > 0 && (
          <ul className="mt-3 space-y-3">
            {pending.map((a) => (
              <PendingCard key={a.id} account={a} />
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
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
                {others.map((a) => (
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
