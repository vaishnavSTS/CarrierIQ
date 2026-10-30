import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { resendVerification, verifyEmail } from '../api/auth'
import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { homeFor, ME_KEY } from '../hooks/useAuth'
import type { User } from '../types/auth'

const okClass =
  'rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800'

/** One request per link, however many times React starts the page's effect. */
const confirming = new Map<string, Promise<User | null>>()

function confirmOnce(token: string): Promise<User | null> {
  let request = confirming.get(token)
  if (!request) {
    request = verifyEmail(token)
    confirming.set(token, request)
  }
  return request
}

/**
 * Two ways in: right after signing up ("check your email"), and from the emailed link
 * (/verify-email#token=...), which confirms the address and opens the portal. Either way they can
 * ask for another email.
 */
export function VerifyEmailPage() {
  const { hash, state } = useLocation()
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [already, setAlready] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  useEffect(() => {
    if (!token) return
    let gone = false
    confirmOnce(token)
      .then((user) => {
        if (gone) return
        if (!user) {
          setAlready(true)
          return
        }
        // Logged in now: drop anything cached from before, as logging in does.
        queryClient.clear()
        queryClient.setQueryData(ME_KEY, user)
        navigate(homeFor(user.portal), { replace: true })
      })
      .catch((error: unknown) => {
        if (!gone) setFailure(error ?? new Error('failed'))
      })
    return () => {
      gone = true
    }
  }, [token, queryClient, navigate])

  const signedUpAs = (state as { email?: string } | null)?.email ?? ''

  if (token && !failure) {
    if (already) {
      return (
        <AuthCard title="Your email is confirmed" subtitle="You can log in now." footer={<LogIn />}>
          <p role="status" className={okClass}>
            This email was already confirmed.
          </p>
        </AuthCard>
      )
    }
    return (
      <AuthCard title="Confirming your email…" subtitle="One moment." footer={<LogIn />}>
        <p role="status" className="text-sm text-slate-600">
          Opening your account.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={failure ? 'This link didn’t work' : 'Check your email'}
      subtitle={
        failure
          ? 'Ask for a new one below.'
          : 'Click the link we sent to finish creating your account. Your free trial starts then.'
      }
      footer={<LogIn />}
    >
      {failure ? (
        <div className="mb-4">
          <FormError
            message={
              failure instanceof ApiError
                ? failure.message
                : 'Could not reach CarrierSafetyScan. Try again in a moment.'
            }
          />
        </div>
      ) : null}
      {signedUpAs && !failure && (
        <p role="status" className={`mb-4 ${okClass}`}>
          We sent a link to {signedUpAs}. It expires in 24 hours. Check your spam folder if you
          don’t see it.
        </p>
      )}
      <ResendForm initialEmail={signedUpAs} />
    </AuthCard>
  )
}

function LogIn() {
  return (
    <Link to="/login" className="font-medium text-accent-strong hover:underline">
      Back to log in
    </Link>
  )
}

function ResendForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [waiting, setWaiting] = useState(false)
  const human = useTurnstile()
  const resend = useMutation({
    mutationFn: () => resendVerification(email, human.headers),
    onSettled: human.reset,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setWaiting(human.pending)
    if (!human.pending) resend.mutate()
  }

  const error =
    waiting && human.pending
      ? (human.problem ?? 'The security check isn’t finished yet. Please wait a moment.')
      : resend.error instanceof ApiError
        ? resend.error.message
        : resend.error
          ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
          : null

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {human.widget}
      <FormError message={error} />
      {resend.isSuccess && (
        <p role="status" className={okClass}>
          If that account still needs confirming, a new link is on its way.
        </p>
      )}
      <SubmitButton busy={resend.isPending}>Send a new link</SubmitButton>
    </form>
  )
}
