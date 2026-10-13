import { CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { homeFor, useCompleteGoogleSignup, useGoogleSignup, useMe } from '../hooks/useAuth'

/**
 * After "Continue with Google", a new person gives their mobile number and USDOT before
 * anything else; the account then waits for STS approval like any other sign-up.
 */
export function GoogleSignupPage() {
  const { data: current } = useMe()
  const pending = useGoogleSignup()
  const complete = useCompleteGoogleSignup()
  const [form, setForm] = useState({ phone: '', usdot: '', company: '' })
  const [localError, setLocalError] = useState<string | null>(null)

  if (current) return <Navigate to={homeFor(current.portal)} replace />

  if (complete.isSuccess) {
    return (
      <AuthCard
        title="Account requested"
        subtitle={complete.data.message}
        footer={
          <Link to="/" className="font-medium text-accent-strong hover:underline">
            Back to the home page
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            Once STS approves the account, use <strong>Continue with Google</strong> on the login
            page to open your portal.
          </p>
        </div>
      </AuthCard>
    )
  }

  if (pending.isPending) {
    return <p className="py-20 text-center text-sm text-slate-500">Loading…</p>
  }

  if (!pending.data) {
    return (
      <AuthCard
        title="Your Google sign-in has expired"
        subtitle="It is kept for 30 minutes. Continue with Google again to finish signing up."
        footer={
          <Link to="/register" className="font-medium text-accent-strong hover:underline">
            Sign up with email instead
          </Link>
        }
      >
        <GoogleButton />
      </AuthCard>
    )
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const company = form.company.trim()
    if (!company) {
      setLocalError('Enter your company name.')
      return
    }
    let phone = form.phone.replace(/\D/g, '')
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
    if (phone.length !== 10) {
      setLocalError('Enter a 10-digit US or Canada mobile number.')
      return
    }
    const usdot = form.usdot.trim()
    if (!/^\d{1,8}$/.test(usdot)) {
      setLocalError('Enter your USDOT number: digits only, up to 8 of them.')
      return
    }
    complete.mutate({ company_name: company, phone, usdot_number: Number(usdot) })
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
      title="Finish signing up"
      subtitle="A few details so STS can confirm the carrier is yours."
      footer={
        <>
          Not you?{' '}
          <Link to="/register" className="font-medium text-accent-strong hover:underline">
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
          label="Company name"
          autoComplete="organization"
          required
          autoFocus
          hint="As registered with FMCSA for your USDOT."
          value={form.company}
          onChange={set('company')}
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
        <Field
          label="USDOT number"
          inputMode="numeric"
          required
          hint="The carrier you operate. STS verifies it before it shows in your portal."
          value={form.usdot}
          onChange={set('usdot')}
        />
        <FormError message={error} />
        <SubmitButton busy={complete.isPending}>Request account</SubmitButton>
      </form>
    </AuthCard>
  )
}
