import { useState, type FormEvent, type ReactNode } from 'react'

import type { AccountInvite } from '../../api/admin'
import { useInviteCarrier, useInviteStaff } from '../../hooks/useAccounts'

export type AddKind = 'carrier' | 'staff'

/** What the admin sees once an account is added: was the "choose your password" email sent? */
export interface AddedAccount {
  kind: AddKind
  email: string
  emailed: boolean
}

const FIELD =
  'mt-1 w-full rounded-md border border-slate-300 bg-canvas px-2.5 py-1.5 text-sm text-slate-900 focus:border-accent focus:outline-none'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
      {hint && <span className="mt-1 block font-normal text-slate-500">{hint}</span>}
    </label>
  )
}

function FormButtons({
  pending,
  disabled,
  label,
  error,
  onCancel,
}: {
  pending: boolean
  disabled: boolean
  label: string
  error: string | null
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active disabled:opacity-50"
      >
        {pending ? 'Adding…' : label}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      >
        Cancel
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  )
}

function added(kind: AddKind, result: AccountInvite): AddedAccount {
  return { kind, email: result.account.email, emailed: result.invite_emailed }
}

/**
 * A carrier account, with what the sign-up form asks for. No password (they choose it from the
 * emailed link) and no "I agree" box: STS made the account. Their USDOT is verified and claimed.
 */
export function AddCarrierForm({
  onDone,
  onCancel,
}: {
  onDone: (result: AddedAccount) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    usdot: '',
  })
  const invite = useInviteCarrier()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const usdotOk = /^\d{1,8}$/.test(form.usdot.trim())
  const complete =
    form.full_name.trim() && form.company_name.trim() && form.email.trim() && form.phone.trim()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!usdotOk) return
    invite.mutate(
      {
        full_name: form.full_name.trim(),
        company_name: form.company_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        usdot_number: Number(form.usdot.trim()),
      },
      { onSuccess: (result) => onDone(added('carrier', result)) },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name">
        <input
          autoFocus
          required
          maxLength={200}
          value={form.full_name}
          onChange={set('full_name')}
          className={FIELD}
        />
      </Field>
      <Field label="Company name" hint="As on the carrier's FMCSA record, if you can">
        <input
          required
          maxLength={200}
          value={form.company_name}
          onChange={set('company_name')}
          className={FIELD}
        />
      </Field>
      <Field label="Email" hint="They get the link to choose a password here">
        <input
          required
          type="email"
          maxLength={254}
          value={form.email}
          onChange={set('email')}
          className={FIELD}
        />
      </Field>
      <Field label="Mobile phone" hint="10-digit US or Canada number">
        <input
          required
          type="tel"
          maxLength={30}
          value={form.phone}
          onChange={set('phone')}
          className={FIELD}
        />
      </Field>
      <Field label="USDOT number" hint="Added as verified and claimed for this account">
        <input
          required
          inputMode="numeric"
          maxLength={8}
          value={form.usdot}
          onChange={set('usdot')}
          className={`${FIELD} font-mono`}
        />
      </Field>
      <p className="self-end text-xs text-slate-500">
        Billing as for a sign-up: a one-month free trial from their first sign-in, then $49 a month.
      </p>
      <FormButtons
        pending={invite.isPending}
        disabled={!complete || !usdotOk}
        label="Add carrier and send invite"
        error={invite.isError ? invite.error.message : null}
        onCancel={onCancel}
      />
    </form>
  )
}

/**
 * An STS admin or analyst. Nobody types a password for them: they get an email with a link to
 * choose their own (or sign in with Google using that address).
 */
export function AddStaffForm({
  onDone,
  onCancel,
}: {
  onDone: (result: AddedAccount) => void
  onCancel: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'STS_ADMIN' | 'STS_ANALYST'>('STS_ANALYST')
  const invite = useInviteStaff()

  function submit(event: FormEvent) {
    event.preventDefault()
    invite.mutate(
      { email: email.trim(), full_name: fullName.trim(), role },
      { onSuccess: (result) => onDone(added('staff', result)) },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name">
        <input
          autoFocus
          required
          maxLength={200}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Email" hint="They get the link to choose a password here">
        <input
          required
          type="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'STS_ADMIN' | 'STS_ANALYST')}
          className={FIELD}
        >
          <option value="STS_ANALYST">Analyst: internal portal</option>
          <option value="STS_ADMIN">Admin: internal portal and managing accounts</option>
        </select>
      </Field>
      <div />
      <FormButtons
        pending={invite.isPending}
        disabled={!fullName.trim() || !email.trim()}
        label="Add staff member and send invite"
        error={invite.isError ? invite.error.message : null}
        onCancel={onCancel}
      />
    </form>
  )
}

/** The note after adding an account: emailed, or tell them to use "Forgot password?". */
export function AddedNote({ result, onClose }: { result: AddedAccount; onClose: () => void }) {
  const login = result.kind === 'staff' ? 'the STS team login page' : 'the login page'
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
        result.emailed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <span>
        {result.emailed
          ? `Account added. ${result.email} has been emailed a link to choose a password (it works for 72 hours).`
          : `Account added, but no email could be sent from here. Ask ${result.email} to use “Forgot password?” on ${login}.`}
      </span>
      <button type="button" onClick={onClose} className="shrink-0 font-medium underline">
        Dismiss
      </button>
    </div>
  )
}
