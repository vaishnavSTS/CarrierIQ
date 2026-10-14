import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, GoogleButton, SubmitButton } from '../features/auth/AuthCard'
import { homeFor, useLogin, useMe } from '../hooks/useAuth'
import type { Portal } from '../types/auth'

/** Where a Google sign-in that did not log in ended up (/login?google=...). */
const GOOGLE_NOTICES: Record<string, string> = {
  pending: 'Your account is waiting for approval by STS. You can log in once it is approved.',
  disabled: 'This account has been disabled. Contact STS for help.',
  failed: 'Google sign-in didn’t finish. Please try again.',
}

/** The portal a page belongs to, from its path. */
function portalOf(path: string): Portal {
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)
  return under('/portal') ? 'client' : under('/broker') ? 'broker' : 'internal'
}

/** Only follow ?next= to a page inside the portal the user just logged in to. */
function safeNext(next: string | null, portal: Portal): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return homeFor(portal)
  const path = next.split(/[?#]/)[0]
  if (portalOf(path) !== portal || path.startsWith('/broker/register')) return homeFor(portal)
  return next
}

/**
 * Log in. One login for everyone (the API says which portal to open); /broker/login is the same
 * form worded for brokers, linking to the broker sign-up.
 */
export function LoginPage({ audience = 'client' }: { audience?: 'client' | 'broker' }) {
  const broker = audience === 'broker'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: current } = useMe()
  const login = useLogin()

  if (current) return <Navigate to={homeFor(current.portal)} replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    login.mutate(
      { email, password },
      {
        onSuccess: (user) => navigate(safeNext(params.get('next'), user.portal), { replace: true }),
      },
    )
  }

  const googleNotice = GOOGLE_NOTICES[params.get('google') ?? '']
  const error =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Could not reach CarrierIQ. Try again in a moment.'
        : (googleNotice ?? null)

  return (
    <AuthCard
      title={broker ? 'Broker login' : 'Log in to CarrierIQ'}
      subtitle={
        broker
          ? 'Vet any carrier: authority, insurance, safety and the Estimated ISS.'
          : 'Clients and STS staff use the same login; we open the right portal for you.'
      }
      footer={
        <>
          {broker ? 'New broker?' : 'New client?'}{' '}
          <Link
            to={broker ? '/broker/register' : '/register'}
            className="font-medium text-accent-strong hover:underline"
          >
            {broker ? 'Create a broker account' : 'Create an account'}
          </Link>
        </>
      }
    >
      <GoogleButton portal={audience} />
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <SubmitButton busy={login.isPending}>Log in</SubmitButton>
      </form>
    </AuthCard>
  )
}
