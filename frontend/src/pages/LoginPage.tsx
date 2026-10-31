import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  AuthCard,
  Field,
  FormError,
  GoogleButton,
  SubmitButton,
  type Audience,
} from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
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

/** Wording per entry point. Any account can log in on any of them: the API says which portal
 * to open. */
const COPY: Record<Audience, { title: string; subtitle: string }> = {
  client: {
    title: 'Log in to CarrierSafetyScan',
    subtitle: 'For clients: your carrier’s FMCSA record and what to improve.',
  },
  broker: {
    title: 'Broker login',
    subtitle: 'Vet any carrier: authority, insurance, safety and the Estimated ISS.',
  },
  insurance: {
    title: 'Insurance agent login',
    subtitle: 'Check any carrier: authority, insurance, safety and the Estimated ISS.',
  },
  staff: {
    title: 'STS team login',
    subtitle: 'For STS admins and analysts. Accounts are created by an STS admin.',
  },
}

/**
 * Log in: /login (clients), /broker/login (brokers, linking to the broker sign-up) and
 * /team/login (STS staff, no sign-up). The same form and the same API on each.
 */
export function LoginPage({ audience = 'client' }: { audience?: Audience }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: current } = useMe()
  const login = useLogin()
  const human = useTurnstile()
  const [waiting, setWaiting] = useState(false)

  if (current) return <Navigate to={homeFor(current.portal)} replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    setWaiting(human.pending)
    if (human.pending) return
    login.mutate(
      { email, password, humanHeaders: human.headers },
      {
        onSuccess: (user) => navigate(safeNext(params.get('next'), user.portal), { replace: true }),
        onError: human.reset,
      },
    )
  }

  const googleNotice = GOOGLE_NOTICES[params.get('google') ?? '']
  const error =
    waiting && human.pending
      ? (human.problem ??
        'The security check isn’t finished yet. Please wait a moment and try again.')
      : login.error instanceof ApiError
        ? login.error.message
        : login.error
          ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
          : (googleNotice ?? null)

  return (
    <AuthCard
      audience={audience}
      title={COPY[audience].title}
      subtitle={COPY[audience].subtitle}
      footer={<LoginFooter audience={audience} />}
    >
      {params.get('reset') === 'done' && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          Your password was changed. Log in with your new password.
        </p>
      )}
      {/* A new Google user would land in another sign-up: agents sign up with their NPN. */}
      {audience !== 'insurance' && (
        <GoogleButton portal={audience === 'broker' ? 'broker' : 'client'} />
      )}
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
        <p className="text-right text-sm">
          <Link to="/forgot-password" className={linkClass}>
            Forgot password?
          </Link>
        </p>
        {human.widget}
        <FormError message={error} />
        {login.error instanceof ApiError && login.error.code === 'email_not_verified' && (
          <p className="text-sm">
            <Link to="/verify-email" state={{ email }} className={linkClass}>
              Send a new confirmation link
            </Link>
          </p>
        )}
        <SubmitButton busy={login.isPending}>Log in</SubmitButton>
      </form>
    </AuthCard>
  )
}

const linkClass = 'font-medium text-accent-strong hover:underline'

function LoginFooter({ audience }: { audience: Audience }) {
  if (audience === 'staff') {
    return (
      <>
        Not on the STS team?{' '}
        <Link to="/login" className={linkClass}>
          Client login
        </Link>{' '}
        ·{' '}
        <Link to="/broker/login" className={linkClass}>
          Broker login
        </Link>
      </>
    )
  }
  if (audience === 'insurance') {
    return (
      <>
        New insurance agent?{' '}
        <Link to="/insurance/register" className={linkClass}>
          Create an agent account
        </Link>
      </>
    )
  }
  const broker = audience === 'broker'
  return (
    <>
      {broker ? 'New broker?' : 'New client?'}{' '}
      <Link to={broker ? '/broker/register' : '/register'} className={linkClass}>
        {broker ? 'Create a broker account' : 'Create an account'}
      </Link>
    </>
  )
}
