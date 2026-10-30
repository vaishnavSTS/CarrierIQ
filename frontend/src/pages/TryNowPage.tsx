import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { startTry } from '../api/carriers'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { SignUpDialog } from '../features/try-now/SignUpDialog'

/** Try Now: look up one carrier by USDOT number, with no account. */
export function TryNowPage() {
  const [params] = useSearchParams()
  const [usdot, setUsdot] = useState(params.get('usdot') ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const human = useTurnstile()
  const search = useMutation({
    mutationFn: (number: number) => startTry(number, human.headers),
    onSuccess: (profile) => {
      queryClient.setQueryData(['carrier-profile', profile.usdot_number], profile)
      navigate(`/try/${profile.usdot_number}`)
    },
    onError: (error) => {
      human.reset()
      if (error instanceof ApiError && error.code === 'try_limit_reached') setLimitReached(true)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const value = usdot.trim()
    if (!/^\d{1,8}$/.test(value) || Number(value) === 0) {
      setLocalError('Enter a USDOT number: digits only, up to 8 of them.')
      return
    }
    if (human.pending) {
      setLocalError(human.problem ?? 'The security check isn’t finished yet. Please wait a moment.')
      return
    }
    search.mutate(Number(value))
  }

  const failure = search.error
  const error =
    localError ??
    (failure instanceof ApiError
      ? failure.status === 404
        ? `No carrier with USDOT ${usdot.trim()} was found. Check the number and try again.`
        : failure.code === 'try_limit_reached'
          ? null
          : failure.message
      : failure
        ? 'Could not reach CarrierSafetyScan. Try again in a moment.'
        : null)

  return (
    <AuthCard
      title="Try CarrierSafetyScan"
      subtitle="Look up one carrier for free: its identity, authority and insurance. No account needed. You get one search, one time only."
      footer={
        <>
          Want every carrier and every tab?{' '}
          <Link to="/register" className="font-medium text-accent-strong hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="USDOT number"
          inputMode="numeric"
          required
          autoFocus
          placeholder="e.g. 2814323"
          value={usdot}
          onChange={(e) => setUsdot(e.target.value)}
        />
        {human.widget}
        <FormError message={error} />
        {search.isPending && (
          <p role="status" className="text-sm text-slate-600">
            The first time a carrier is opened, its record is fetched from FMCSA. This can take a
            few seconds.
          </p>
        )}
        <SubmitButton busy={search.isPending}>Search</SubmitButton>
      </form>
      {limitReached && (
        <SignUpDialog
          title="You’ve used your free search"
          message="Sign up to search any carrier and see its safety record, inspections, Safety Score Report and more."
          onClose={() => setLimitReached(false)}
        />
      )}
    </AuthCard>
  )
}
