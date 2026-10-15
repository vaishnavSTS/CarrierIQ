import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'

/** Client portal: look up any carrier (?q=…), e.g. one they partner with or lease from. */
export function ClientSearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <Search className="size-5 text-accent-strong" aria-hidden />
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
