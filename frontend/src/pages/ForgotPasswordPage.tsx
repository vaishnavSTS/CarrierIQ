import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { forgotPassword } from '../api/auth'
import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'

/** Asks for a password reset link. The answer is the same whether or not the account exists. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [waiting, setWaiting] = useState(false)
  const human = useTurnstile()
  const request = useMutation({
    mutationFn: () => forgotPassword(email, human.token),
    onError: human.reset,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setWaiting(human.pending)
    if (!human.pending) request.mutate()
  }

  const error =
    waiting && human.pending
      ? (human.problem ?? 'The security check isn’t finished yet. Please wait a moment.')
      : request.error instanceof ApiError
        ? request.error.message
        : request.error
          ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
          : null

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account’s email and we’ll send you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-accent-strong hover:underline">
          Back to log in
        </Link>
      }
    >
      {request.isSuccess ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          If an account uses {email}, a reset link is on its way. It works once and expires in 30
          minutes. Check your spam folder if you don’t see it.
        </p>
      ) : (
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
          {human.widget}
          <FormError message={error} />
          <SubmitButton busy={request.isPending}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
