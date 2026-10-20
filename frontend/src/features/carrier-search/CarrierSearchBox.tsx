import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useSearchPath } from '../../hooks/usePortalMode'

interface Props {
  initialQuery?: string
  autoFocus?: boolean
}

/** Submitting navigates to /search?q=… (/broker?q=… for brokers), so a search can be bookmarked
 * and the back button works. */
export function CarrierSearchBox({ initialQuery = '', autoFocus = false }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const navigate = useNavigate()
  const searchPath = useSearchPath()

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) navigate(`${searchPath}?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={submit} role="search" className="flex gap-2">
      <label htmlFor="carrier-search" className="sr-only">
        Search USDOT, MC, or carrier name
      </label>
      <input
        id="carrier-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search USDOT, MC, or Carrier Name"
        autoFocus={autoFocus}
        maxLength={100}
        className="w-full rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <button
        type="submit"
        className="rounded-md bg-cta px-4 py-2 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active disabled:opacity-50"
        disabled={!query.trim()}
      >
        Search
      </button>
    </form>
  )
}
