import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { resetPassword } from '../api/auth'
import { ApiError } from '../api/client'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'

const MIN_PASSWORD = 10 // matches the API's AUTH_MIN_PASSWORD_LENGTH default

/** Where the emailed link lands (/reset-password#token=...): choose a new password. */
export function ResetPasswordPage() {
  const { hash } = useLocation()
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const reset = useMutation({
    mutationFn: () => resetPassword(token ?? '', password),
    onSuccess: () => navigate('/login?reset=done', { replace: true }),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    if (password.length < MIN_PASSWORD) {
      setLocalError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (password !== confirm) {
      setLocalError('The two passwords don’t match.')
      return
    }
    reset.mutate()
  }

  const error =
    localError ??
    (reset.error instanceof ApiError
      ? reset.error.message
      : reset.error
        ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
        : null)

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="You’ll use it to log in to CarrierSafetyScan from now on."
      footer={
        <Link to="/forgot-password" className="font-medium text-accent-strong hover:underline">
          Need a new link?
        </Link>
      }
    >
      {token ? (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Repeat new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <FormError message={error} />
          <SubmitButton busy={reset.isPending}>Save new password</SubmitButton>
        </form>
      ) : (
        <FormError message="This link isn’t complete. Please open it from the email again, or ask for a new one." />
      )}
    </AuthCard>
  )
}
