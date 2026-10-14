import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { BrokerIdField } from '../features/auth/BrokerIdField'
import { homeFor, useCompleteBrokerGoogleSignup, useGoogleSignup, useMe } from '../hooks/useAuth'
import type { BrokerIdKind } from '../types/auth'
import { parseBrokerId } from '../utils/brokerId'

/**
 * After "Sign up with Google" on the broker pages, a new person gives their brokerage, mobile
 * number and MC (or USDOT) number; once FMCSA shows broker authority they land in the portal.
 */
export function BrokerGoogleSignupPage() {
  const { data: current } = useMe()
  const pending = useGoogleSignup()
  const complete = useCompleteBrokerGoogleSignup()
  const [form, setForm] = useState({ phone: '', id_number: '', company: '' })
  const [idKind, setIdKind] = useState<BrokerIdKind>('MC')
  const [localError, setLocalError] = useState<string | null>(null)

  if (current) return <Navigate to={homeFor(current.portal)} replace />

  if (pending.isPending) {
    return <p className="py-20 text-center text-sm text-slate-500">Loading…</p>
  }

  if (!pending.data) {
    return (
      <AuthCard
        audience="broker"
        title="Your Google sign-in has expired"
        subtitle="It is kept for 30 minutes. Continue with Google again to finish signing up."
        footer={
          <Link to="/broker/register" className="font-medium text-accent-strong hover:underline">
            Sign up with email instead
          </Link>
        }
      >
        <GoogleButton portal="broker" />
      </AuthCard>
    )
  }

  // Started from the client sign-up: finish there.
  if (pending.data.portal !== 'broker') return <Navigate to="/register/google" replace />

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const company = form.company.trim()
    if (!company) {
      setLocalError('Enter your brokerage name.')
      return
    }
    let phone = form.phone.replace(/\D/g, '')
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
    if (phone.length !== 10) {
      setLocalError('Enter a 10-digit US or Canada mobile number.')
      return
    }
    const idNumber = parseBrokerId(form.id_number)
    if (idNumber === null) {
      setLocalError(`Enter your ${idKind} number: digits only, up to 8 of them.`)
      return
    }
    complete.mutate({ company_name: company, phone, id_kind: idKind, id_number: idNumber })
  }

  const error =
    localError ??
    (complete.error instanceof ApiError
      ? complete.error.message
      : complete.error
        ? 'Could not reach CarrierIQ. Try again in a moment.'
        : null)

  return (
    <AuthCard
      audience="broker"
      title="Finish signing up"
      subtitle="Your brokerage and its MC number, so we can confirm your broker authority."
      footer={
        <>
          Not you?{' '}
          <Link to="/broker/register" className="font-medium text-accent-strong hover:underline">
            Start again
          </Link>
        </>
      }
    >
      <div className="mb-5 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-sm">
        <div className="font-medium text-slate-900">{pending.data.full_name}</div>
        <div className="text-slate-500">{pending.data.email} · verified by Google</div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Brokerage name"
          autoComplete="organization"
          required
          autoFocus
          value={form.company}
          onChange={set('company')}
        />
        <BrokerIdField
          kind={idKind}
          value={form.id_number}
          onKindChange={setIdKind}
          onValueChange={(value) => setForm((f) => ({ ...f, id_number: value }))}
        />
        <Field
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          required
          placeholder="(555) 123-4567"
          hint="STS may call to confirm your account."
          value={form.phone}
          onChange={set('phone')}
        />
        <FormError message={error} />
        <SubmitButton busy={complete.isPending}>Open my broker portal</SubmitButton>
      </form>
    </AuthCard>
  )
}
