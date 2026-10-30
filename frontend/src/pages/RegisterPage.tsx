import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { homeFor, useMe, useRegister } from '../hooks/useAuth'

const MIN_PASSWORD = 10 // matches the API's AUTH_MIN_PASSWORD_LENGTH default

export function RegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    usdot: '',
    password: '',
    confirm: '',
  })
  const [localError, setLocalError] = useState<string | null>(null)
  const { data: current } = useMe()
  const human = useTurnstile()
  const navigate = useNavigate()
  const register = useRegister()

  // Signing up logs the client in, so this also sends them to their portal afterwards.
  if (current) return <Navigate to={homeFor(current.portal)} replace />

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (form.password.length < MIN_PASSWORD) {
      setLocalError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (form.password !== form.confirm) {
      setLocalError('The two passwords don’t match.')
      return
    }
    const usdot = form.usdot.trim()
    if (!/^\d{1,8}$/.test(usdot)) {
      setLocalError('Enter your USDOT number: digits only, up to 8 of them.')
      return
    }
    let phone = form.phone.replace(/\D/g, '')
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
    if (phone.length !== 10) {
      setLocalError('Enter a 10-digit US or Canada mobile number.')
      return
    }
    if (human.pending) {
      setLocalError(
        human.problem ??
          'The security check isn’t finished yet. Please wait a moment and try again.',
      )
      return
    }
    register.mutate(
      {
        input: {
          full_name: form.full_name,
          company_name: form.company_name,
          email: form.email,
          phone,
          password: form.password,
          usdot_number: Number(usdot),
        },
        humanHeaders: human.headers,
      },
      {
        onError: human.reset,
        onSuccess: (user) => {
          if (user.email_verified === false) {
            navigate('/verify-email', { state: { email: user.email } })
          }
        },
      },
    )
  }

  const error =
    localError ??
    (register.error instanceof ApiError
      ? register.error.message
      : register.error
        ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
        : null)

  return (
    <AuthCard
      wide
      title="Create a carrier account"
      subtitle="For carriers. Your portal opens as soon as you sign up."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-strong hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field
            label="Your name"
            autoComplete="name"
            required
            value={form.full_name}
            onChange={set('full_name')}
          />
          <Field
            label="Company name"
            autoComplete="organization"
            required
            value={form.company_name}
            onChange={set('company_name')}
          />
          <Field
            label="Work email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
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
          <div className="sm:col-span-2">
            <Field
              label="USDOT number"
              inputMode="numeric"
              required
              hint="The carrier you operate; it opens in your portal."
              value={form.usdot}
              onChange={set('usdot')}
            />
          </div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={form.password}
            onChange={set('password')}
          />
          <Field
            label="Repeat password"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
          />
        </div>
        {human.widget}
        <FormError message={error} />
        <SubmitButton busy={register.isPending}>Create account</SubmitButton>
      </form>
    </AuthCard>
  )
}
