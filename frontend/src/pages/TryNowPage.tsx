import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { findTry, startTry, type TryMatch } from '../api/carriers'
import { AuthCard, Field, FormError, SubmitButton } from '../features/auth/AuthCard'
import { useTurnstile } from '../features/auth/useTurnstile'
import { FaqSection } from '../features/landing/Faq'
import { TRY_FAQ } from '../features/landing/faqContent'
import { Band } from '../features/landing/landingParts'
import { SignUpDialog } from '../features/try-now/SignUpDialog'

const ONLY_DIGITS = /^\d{1,8}$/

/**
 * Try Now: look up one carrier with no account. A USDOT number opens it straight away; an MC number
 * or a company name lists the matches first, and only opening one uses the free search.
 */
export function TryNowPage() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? params.get('usdot') ?? '')
  const [matches, setMatches] = useState<TryMatch[] | null>(null)
  const [searched, setSearched] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const human = useTurnstile()

  function failed(error: Error) {
    human.reset()
    if (error instanceof ApiError && error.code === 'try_limit_reached') setLimitReached(true)
  }
  const open = useMutation({
    mutationFn: (number: number) => startTry(number, human.headers),
    onSuccess: (profile) => {
      queryClient.setQueryData(['carrier-profile', profile.usdot_number], profile)
      navigate(`/try/${profile.usdot_number}`)
    },
    onError: failed,
  })
  const find = useMutation({
    mutationFn: (text: string) => findTry(text, human.headers),
    onSuccess: (found, text) => {
      human.reset() // a token works once, and opening a carrier needs its own
      setSearched(text)
      setMatches(found)
    },
    onError: failed,
  })

  /** The security check has to pass again before each request. */
  function ready(): boolean {
    if (!human.pending) return true
    setLocalError(human.problem ?? 'The security check isn’t finished yet. Please wait a moment.')
    return false
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    setMatches(null)
    open.reset()
    find.reset()
    const value = query.trim()
    if (!value || /^0+$/.test(value)) {
      setLocalError('Enter a USDOT number, an MC number or a company name.')
      return
    }
    if (!ready()) return
    if (ONLY_DIGITS.test(value)) open.mutate(Number(value))
    else find.mutate(value)
  }

  function choose(match: TryMatch) {
    setLocalError(null)
    if (ready()) open.mutate(match.usdot_number)
  }

  const failure = open.error ?? find.error
  const error =
    localError ??
    (failure instanceof ApiError
      ? failure.status === 404
        ? `No carrier with USDOT ${query.trim()} was found. Check the number and try again.`
        : failure.code === 'try_limit_reached'
          ? null
          : failure.message
      : failure
        ? 'Could not reach Carrier Safety Scan. Try again in a moment.'
        : null)

  return (
    <>
      <AuthCard
        title="Try Carrier Safety Scan"
        subtitle="Look up one carrier for free and see every tab, from its authority and insurance to its inspections and Safety Score Report. No account needed. You get one search, one time only."
        footer={
          <>
            Want every tab?{' '}
            <Link to="/register" className="font-medium text-accent-strong hover:underline">
              Sign up
            </Link>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="USDOT number, MC number or company name"
            required
            autoFocus
            placeholder="e.g. 2814323, MC 852168 or ACME Hauling"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {human.widget}
          <FormError message={error} />
          {open.isPending && (
            <p role="status" className="text-sm text-slate-600">
              The first time a carrier is opened, its record is loaded. This can take a few seconds.
            </p>
          )}
          {find.isPending && (
            <p role="status" className="text-sm text-slate-600">
              Searching…
            </p>
          )}
          <SubmitButton busy={open.isPending || find.isPending}>Search</SubmitButton>
        </form>
        {matches !== null && matches.length === 0 && (
          <p role="status" className="mt-4 text-sm text-slate-700">
            No carrier found for “{searched}”. Check the spelling or try the USDOT number. This
            didn’t use your free search.
          </p>
        )}
        {matches !== null && matches.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-900">
              Pick your carrier. Opening one uses your one free search.
            </p>
            <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {matches.map((m) => (
                <li key={m.usdot_number}>
                  <button
                    type="button"
                    disabled={open.isPending}
                    onClick={() => choose(m)}
                    className="w-full min-h-11 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <span className="block font-medium text-slate-900">{m.legal_name}</span>
                    <span className="block text-xs text-slate-600">
                      {m.dba_name && `DBA ${m.dba_name} · `}USDOT {m.usdot_number}
                      {(m.city || m.state) && ` · ${[m.city, m.state].filter(Boolean).join(', ')}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Shows up to 10 matches; add more of the name if yours isn’t here.
            </p>
          </div>
        )}
        {limitReached && (
          <SignUpDialog
            title="Sign up for a 30-day free trial"
            message="You’ve used your free search. A full account adds the safety record, inspections, Safety Score Report and more."
            onClose={() => setLimitReached(false)}
          />
        )}
      </AuthCard>
      <Band tone="grid">
        <FaqSection items={TRY_FAQ} title="About the free search" />
      </Band>
    </>
  )
}
