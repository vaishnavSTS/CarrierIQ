import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { homeFor, useMe, useRegisterInsurance } from '../hooks/useAuth'

const MIN_PASSWORD = 10 // matches the API's AUTH_MIN_PASSWORD_LENGTH default

/** Insurance agent sign-up: like the broker one, with a license number instead of an MC number. */
export function InsuranceRegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    license_number: '',
    password: '',
    confirm: '',
  })
  const [localError, setLocalError] = useState<string | null>(null)
  const { data: current } = useMe()
  const human = useTurnstile()
  const navigate = useNavigate()
  const register = useRegisterInsurance()

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
    const license = form.license_number.trim()
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
          license_number: license,
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
      audience="insurance"
      title="Create an insurance agent account"
      subtitle="For insurance agents. Check any carrier’s record as soon as you sign up."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/insurance/login" className="font-medium text-accent-strong hover:underline">
            Log in
          </Link>
        </>
      }
    >
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
            label="Agency name"
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
              label="National Producer Number (NPN)"
              inputMode="numeric"
              required
              maxLength={10}
              hint="Your insurance license’s number. STS may check it."
              value={form.license_number}
              onChange={set('license_number')}
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
        <SubmitButton busy={register.isPending}>Create agent account</SubmitButton>
      </form>
    </AuthCard>
  )
}
