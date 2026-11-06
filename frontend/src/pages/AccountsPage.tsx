import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import {
  useAccountAction,
  useAccounts,
  useAddAccountCarrier,
  useDeleteAccount,
  useInviteStaff,
  useMarkAccountsSeen,
  useReleaseClaim,
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
  INSURANCE_AGENT: 'Insurance agent',
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

/**
 * Each USDOT with whether STS has verified it as the client's. Approving the account does not
 * verify a carrier; until it is verified the client cannot start DataQs requests for it.
 */
function AccountCarriers({ account }: { account: AdminUser }) {
  const verify = useAddAccountCarrier()
  const canVerify = account.role.startsWith('CLIENT_') && account.status !== 'DISABLED'
  if (account.usdot_numbers.length === 0) return <UsdotLinks numbers={[]} />
  return (
    <ul className="space-y-1">
      {account.usdot_numbers.map((n) => {
        const verified = account.verified_usdot_numbers.includes(n)
        const pending = verify.isPending && verify.variables?.usdotNumber === n
        return (
          <li key={n} className="flex flex-wrap items-center gap-1.5">
            <UsdotLinks numbers={[n]} />
            <StatusBadge
              label={verified ? 'Verified' : 'Not verified'}
              tone={verified ? 'ok' : 'warn'}
            />
            {!verified && canVerify && (
              <button
                type="button"
                disabled={verify.isPending}
                onClick={() => verify.mutate({ id: account.id, usdotNumber: n })}
                title="Confirm this carrier belongs to the client. Needed before they can use DataQs."
                className="rounded bg-cta px-2 py-0.5 font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
              >
                {pending ? 'Verifying…' : 'Verify'}
              </button>
            )}
          </li>
        )
      })}
      {verify.isError && <li className="text-red-700">{verify.error.message}</li>}
    </ul>
  )
}

/**
 * The Claim column: each USDOT this carrier account has claimed (no other carrier account can sign
 * up with it), with Release claim. The first press asks to confirm; the account keeps the carrier.
 */
function AccountClaims({ account }: { account: AdminUser }) {
  const release = useReleaseClaim()
  // The number whose "Release claim" was pressed once: a second press confirms
  const [releasing, setReleasing] = useState<number | null>(null)
  const claimed = account.claimed_usdot_numbers ?? []
  if (claimed.length === 0) return <span className="text-slate-400">—</span>
  return (
    <ul className="space-y-1.5">
      {claimed.map((n) => (
        <li key={n} className="flex flex-wrap items-center gap-1.5">
          {releasing === n ? (
            <>
              <span className="text-slate-600">Let another carrier sign up with {n}?</span>
              <button
                type="button"
                disabled={release.isPending}
                onClick={() =>
                  release.mutate(
                    { id: account.id, usdotNumber: n },
                    { onSettled: () => setReleasing(null) },
                  )
                }
                className="rounded-md bg-red-700 px-3 py-1.5 font-semibold shadow-sm text-surface hover:bg-red-800 disabled:opacity-50"
              >
                {release.isPending ? 'Releasing…' : 'Yes, release'}
              </button>
              <button
                type="button"
                onClick={() => setReleasing(null)}
                className="rounded-md px-3 py-1.5 font-semibold shadow-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <StatusBadge label="Claimed" tone="ok" />
              {claimed.length > 1 && <span className="font-mono text-slate-600">{n}</span>}
              <button
                type="button"
                onClick={() => setReleasing(n)}
                title="Free this USDOT number so another carrier account can sign up with it. This account keeps the carrier in its portal."
                className="whitespace-nowrap rounded-md bg-red-700 px-3 py-1.5 font-semibold shadow-sm text-surface hover:bg-red-800"
              >
                Release claim
              </button>
            </>
          )}
        </li>
      ))}
      {release.isError && <li className="text-red-700">{release.error.message}</li>}
    </ul>
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
        USDOT {check.usdot_number} isn’t loaded in Carrier Safety Scan yet.{' '}
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
                    {a.usdot_numbers.some((n) => !a.verified_usdot_numbers.includes(n)) &&
                      ' (not verified yet: verify it in the table to allow DataQs)'}
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
            className="rounded-md bg-cta px-4 py-2 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active disabled:opacity-50"
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
 * Add an STS admin or analyst. Nobody types a password for them: they get an email with a link to
 * choose their own (or sign in with Google using that address).
 */
function AddStaffForm() {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'STS_ADMIN' | 'STS_ANALYST'>('STS_ANALYST')
  const [done, setDone] = useState<{ email: string; emailed: boolean } | null>(null)
  const invite = useInviteStaff()

  function submit(event: FormEvent) {
    event.preventDefault()
    invite.mutate(
      { email: email.trim(), full_name: fullName.trim(), role },
      {
        onSuccess: (result) => {
          setDone({ email: result.account.email, emailed: result.invite_emailed })
          setFullName('')
          setEmail('')
          setRole('STS_ANALYST')
          setOpen(false)
        },
      },
    )
  }

  const field =
    'mt-1 w-full rounded-md border border-slate-300 bg-canvas px-2.5 py-1.5 text-sm text-slate-900'

  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">STS staff</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Add a team member. They get an email to choose their own password.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setDone(null)
              invite.reset()
            }}
            className="flex items-center gap-1.5 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active"
          >
            <UserPlus className="size-4" aria-hidden />
            Add staff member
          </button>
        )}
      </div>

      {done && (
        <p
          role="status"
          className={`mt-3 rounded-md px-3 py-2 text-sm ${done.emailed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
        >
          {done.emailed
            ? `Account made. ${done.email} has been emailed a link to choose a password (it works for 72 hours).`
            : `Account made, but no email could be sent from here. Ask ${done.email} to use “Forgot password?” on the STS team login page.`}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-medium text-slate-600">
            Full name
            <input
              autoFocus
              required
              maxLength={200}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Email
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'STS_ADMIN' | 'STS_ANALYST')}
              className={field}
            >
              <option value="STS_ANALYST">Analyst</option>
              <option value="STS_ADMIN">Admin (manages accounts)</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={invite.isPending || !fullName.trim() || !email.trim()}
              className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active disabled:opacity-50"
            >
              {invite.isPending ? 'Adding…' : 'Add and send invite'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            {invite.isError && <span className="text-sm text-red-700">{invite.error.message}</span>}
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * Delete an account for good. The first press asks to confirm, saying what goes with it. The
 * server refuses accounts that other records name (DataQs work, invoices): its answer says so.
 */
function DeleteAccount({ account, withCompany }: { account: AdminUser; withCompany: boolean }) {
  const remove = useDeleteAccount()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setConfirming(true)
            remove.reset()
          }}
          title="Remove this account for good. Accounts with DataQs work or invoices can only be disabled."
          className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-600 hover:bg-red-50"
        >
          Delete
        </button>
        {remove.isError && (
          <p className="mt-1 max-w-56 text-left text-xs text-red-700">{remove.error.message}</p>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-64 space-y-1.5 text-left text-xs">
      <p className="text-slate-700">
        Delete {account.full_name} for good?
        {withCompany &&
          ` This also removes ${account.organization_name} and its USDOT claims, so the numbers can be claimed again.`}{' '}
        This can’t be undone.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate(account.id, { onSettled: () => setConfirming(false) })}
          className="whitespace-nowrap rounded-md bg-red-700 px-3 py-1.5 font-semibold shadow-sm text-surface hover:bg-red-800 disabled:opacity-50"
        >
          {remove.isPending ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-3 py-1.5 font-semibold shadow-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function AccountRow({
  account,
  isMe,
  onlyInCompany,
}: {
  account: AdminUser
  isMe: boolean
  /** No other account shares this account's company */
  onlyInCompany: boolean
}) {
  const action = useAccountAction()
  const isStaff = account.role.startsWith('STS_')

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
            <AccountCarriers account={account} />
            {account.carrier_checks.map((check) => (
              <ContactCheck key={check.usdot_number} check={check} />
            ))}
            {account.role.startsWith('CLIENT_') && account.status !== 'DISABLED' && (
              <AddUsdot accountId={account.id} />
            )}
          </>
        )}
      </td>
      <td className="py-2.5 pr-4 text-xs">
        <AccountClaims account={account} />
      </td>
      <td className="py-2.5 pr-4">
        <StatusBadge label={account.status} tone={STATUS_TONES[account.status]} />
      </td>
      <td className="py-2.5 pr-4 text-xs text-slate-500">
        {account.last_login_at ? formatDateTime(account.last_login_at) : 'never'}
      </td>
      <td className="space-y-1.5 py-2.5 pr-1 text-right">
        {account.status === 'ACTIVE' && !isMe && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: account.id, action: 'disable' })}
            className="whitespace-nowrap rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold shadow-sm text-surface hover:bg-red-800 disabled:opacity-50"
          >
            Disable
          </button>
        )}
        {account.status === 'DISABLED' && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: account.id, action: 'reactivate' })}
            className="whitespace-nowrap rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold shadow-sm text-surface hover:bg-emerald-800 disabled:opacity-50"
          >
            Re-activate
          </button>
        )}
        {!isMe && (
          <div className="flex justify-end">
            <DeleteAccount account={account} withCompany={onlyInCompany && !isStaff} />
          </div>
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
  const perCompany = new Map<number, number>()
  for (const a of accounts) {
    perCompany.set(a.organization_id, (perCompany.get(a.organization_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      {newAccounts.length > 0 && <NewSignupsDialog accounts={newAccounts} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everyone who can log in. Clients get into their portal as soon as they sign up; disable an
          account to stop it, or delete it to remove it for good.
        </p>
      </div>

      <AddStaffForm />

      {isPending && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-red-700">Couldn’t load accounts.</p>}
      {accounts.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-5">
          <h2 className="text-sm font-semibold text-slate-900">All accounts</h2>
          <div className="mt-3 relative overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Company</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">USDOT</th>
                  <th className="pb-2 pr-4 font-medium">Claim</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Last login</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
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
        </section>
      )}
    </div>
  )
}

/** A broker account's brokerage: the MC / USDOT whose broker authority FMCSA confirmed. */
function BrokerIdentity({ broker }: { broker: Brokerage }) {
  if (broker.license_number) {
    return (
      <div className="text-xs text-slate-600">
        NPN {broker.license_number}{' '}
        <span className="text-amber-700">· as given at sign-up, not checked</span>
      </div>
    )
  }
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
        broker ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {broker ? 'Broker' : 'Client'}
    </span>
  )
}
