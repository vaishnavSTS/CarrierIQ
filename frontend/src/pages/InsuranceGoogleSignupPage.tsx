import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { AgreeToTerms, MUST_AGREE } from '../features/legal/AgreeToTerms'
import {
  GOOGLE_SIGNUP_PATH,
  homeFor,
  useCompleteInsuranceGoogleSignup,
  useGoogleSignup,
  useMe,
} from '../hooks/useAuth'

/**
 * After "Sign up with Google" on the insurance agent pages, a new person gives their agency,
 * mobile number and National Producer Number; then they land in the agent portal.
 */
export function InsuranceGoogleSignupPage() {
  const { data: current } = useMe()
  const pending = useGoogleSignup()
  const complete = useCompleteInsuranceGoogleSignup()
  const [form, setForm] = useState({ company: '', phone: '', license: '' })
  const [localError, setLocalError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false) // "I agree to the Terms … and Privacy Policy"

  if (current) return <Navigate to={homeFor(current.portal)} replace />

  if (pending.isPending) {
    return <p className="py-20 text-center text-sm text-slate-500">Loading…</p>
  }

  if (!pending.data) {
    return (
      <AuthCard
        audience="insurance"
        title="Your Google sign-in has expired"
        subtitle="It is kept for 30 minutes. Continue with Google again to finish signing up."
        footer={
          <Link to="/insurance/register" className="font-medium text-accent-strong hover:underline">
            Sign up with email instead
          </Link>
        }
      >
        <GoogleButton portal="insurance" />
      </AuthCard>
    )
  }

  // Started from another sign-up: finish there.
  if (pending.data.portal !== 'insurance') {
    return <Navigate to={GOOGLE_SIGNUP_PATH[pending.data.portal]} replace />
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (!agreed) {
      setLocalError(MUST_AGREE)
      return
    }
    const company = form.company.trim()
    if (!company) {
      setLocalError('Enter your agency name.')
      return
    }
    const license = form.license.trim()
    if (!/^\d{1,10}$/.test(license)) {
      setLocalError('Enter your National Producer Number: digits only, up to 10 of them.')
      return
    }
    let phone = form.phone.replace(/\D/g, '')
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
    if (phone.length !== 10) {
      setLocalError('Enter a 10-digit US or Canada mobile number.')
      return
    }
    complete.mutate({
      company_name: company,
      phone,
      license_number: license,
      accept_terms: agreed,
    })
  }

  const error =
    localError ??
    (complete.error instanceof ApiError
      ? complete.error.message
      : complete.error
        ? 'Could not reach Carrier Safety Scan. Try again in a moment.'
        : null)

  return (
    <AuthCard
      audience="insurance"
      title="Finish signing up"
      subtitle="Your agency and your National Producer Number."
      footer={
        <>
          Not you?{' '}
          <Link to="/insurance/register" className="font-medium text-accent-strong hover:underline">
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
          label="Agency name"
          autoComplete="organization"
          required
          autoFocus
          value={form.company}
          onChange={set('company')}
        />
        <Field
          label="National Producer Number (NPN)"
          inputMode="numeric"
          required
          hint="Your insurance license’s number. STS may check it."
          value={form.license}
          onChange={set('license')}
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
        <AgreeToTerms checked={agreed} onChange={setAgreed} />
        <FormError message={error} />
        <SubmitButton busy={complete.isPending}>Open my agent portal</SubmitButton>
      </form>
    </AuthCard>
  )
}
