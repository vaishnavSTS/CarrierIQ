import { Search } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'

import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { CARD, LABEL } from '../features/portal/carrier/ui'
import { useAuthOptions } from '../hooks/useAuth'

/** Carrier portal: look up any carrier (?q=…), while client search is switched on for team
 * testing (CLIENT_SEARCH_ENABLED). */
export function ClientSearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const options = useAuthOptions()
  // Search is switched off (after team testing): carrier accounts see only their own carriers.
  if (options.data && !options.data.client_search) return <Navigate to="/portal" replace />

  return (
    <div className="space-y-6">
      <section className={`${CARD} space-y-4`}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
            <Search className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className={`${LABEL} text-slate-500`}>Any carrier</div>
            <h1 className="text-2xl font-semibold text-slate-950">Search carriers</h1>
          </div>
        </div>
        <div>
          <p className="text-sm text-slate-600">
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
