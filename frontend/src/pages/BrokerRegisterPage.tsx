import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { BrokerIdField } from '../features/auth/BrokerIdField'
import { homeFor, useMe, useRegisterBroker } from '../hooks/useAuth'
import type { BrokerIdKind } from '../types/auth'
import { parseBrokerId } from '../utils/brokerId'

const MIN_PASSWORD = 10 // matches the API's AUTH_MIN_PASSWORD_LENGTH default

/** Broker sign-up: like the client one, with the brokerage's MC (or USDOT) number instead. */
export function BrokerRegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    id_number: '',
    password: '',
    confirm: '',
  })
  const [idKind, setIdKind] = useState<BrokerIdKind>('MC')
  const [localError, setLocalError] = useState<string | null>(null)
  const { data: current } = useMe()
  const register = useRegisterBroker()

  // Signing up logs the broker in, so this also sends them to their portal afterwards.
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
    const idNumber = parseBrokerId(form.id_number)
    if (idNumber === null) {
      setLocalError(`Enter your ${idKind} number: digits only, up to 8 of them.`)
      return
    }
    let phone = form.phone.replace(/\D/g, '')
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
    if (phone.length !== 10) {
      setLocalError('Enter a 10-digit US or Canada mobile number.')
      return
    }
    register.mutate({
      full_name: form.full_name,
      company_name: form.company_name,
      email: form.email,
      phone,
      password: form.password,
      id_kind: idKind,
      id_number: idNumber,
    })
  }

  const error =
    localError ??
    (register.error instanceof ApiError
      ? register.error.message
      : register.error
        ? 'Could not reach CarrierIQ. Try again in a moment.'
        : null)

  return (
    <AuthCard
      title="Create a broker account"
      subtitle="For freight brokers. Vet any carrier as soon as you sign up."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/broker/login" className="font-medium text-accent-strong hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" portal="broker" />
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Your name"
          autoComplete="name"
          required
          value={form.full_name}
          onChange={set('full_name')}
        />
        <Field
          label="Brokerage name"
          autoComplete="organization"
          required
          value={form.company_name}
          onChange={set('company_name')}
        />
        <BrokerIdField
          kind={idKind}
          value={form.id_number}
          onKindChange={setIdKind}
          onValueChange={(value) => setForm((f) => ({ ...f, id_number: value }))}
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
        <FormError message={error} />
        <SubmitButton busy={register.isPending}>Create broker account</SubmitButton>
      </form>
    </AuthCard>
  )
}
