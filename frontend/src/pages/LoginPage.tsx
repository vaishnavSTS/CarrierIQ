import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { homeFor, useLogin, useMe } from '../hooks/useAuth'
import type { Portal } from '../types/auth'

/** Only follow ?next= to a page inside the portal the user just logged in to. */
function safeNext(next: string | null, portal: Portal): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return homeFor(portal)
  const isClientPage = next === '/portal' || next.startsWith('/portal/')
  if ((portal === 'client') !== isClientPage) return homeFor(portal)
  return next
}

export function LoginPage() {
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

  const error =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Could not reach CarrierIQ. Try again in a moment.'
        : null

  return (
    <AuthCard
      title="Log in to CarrierIQ"
      subtitle="Clients and STS staff use the same login; we open the right portal for you."
      footer={
        <>
          New client?{' '}
          <Link to="/register" className="font-medium text-accent-strong hover:underline">
            Create an account
          </Link>
        </>
      }
    >
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
