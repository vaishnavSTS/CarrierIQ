import { Search } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'

import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { useAuthOptions } from '../hooks/useAuth'

/** Client portal: look up any carrier (?q=…), while client search is switched on for team
 * testing (CLIENT_SEARCH_ENABLED). */
export function ClientSearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const options = useAuthOptions()
  // Search is switched off (after team testing): clients see only their own carriers.
  if (options.data && !options.data.client_search) return <Navigate to="/portal" replace />

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <Search className="size-5 text-slate-500" aria-hidden />
            Search carriers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Look up any carrier by USDOT, MC number or name, and see its FMCSA record the way
            brokers check it.
          </p>
        </div>
        {/* key: reset the box when the URL query changes (e.g. back button) */}
        <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />
      </section>

      {query && <SearchResultsPanel query={query} />}
    </div>
  )
}
