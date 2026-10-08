import { useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { CarrierSearchResults } from '../features/carrier-search/CarrierSearchResults'
import { useCarrierSearch } from '../hooks/useCarrierSearch'
import type { SearchKind } from '../types/carrier'

const KIND_LABEL: Record<SearchKind, string> = {
  usdot: 'USDOT number',
  docket: 'docket number',
  name: 'carrier name',
}

export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const { data, error, isFetching } = useCarrierSearch(query)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Carrier search</h1>
      {/* key: reset the box when the URL query changes (e.g. back button) */}
      <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />

      {isFetching && (
        <p className="text-sm text-slate-600" role="status">
          Searching… a carrier not yet in CarrierIQ is loaded from FMCSA first, which can take a few
          seconds.
        </p>
      )}

      {error && !isFetching && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error instanceof ApiError && error.status === 422
            ? error.message
            : `Search failed: ${error.message}`}
        </div>
      )}

      {data && !isFetching && (
        <>
          <p className="text-sm text-slate-600">
            {data.results.length === 0
              ? `No carrier found for ${KIND_LABEL[data.query_type]} “${data.query}”.`
              : `${data.results.length} result${data.results.length === 1 ? '' : 's'} for ${KIND_LABEL[data.query_type]} “${data.query}”.`}
          </p>
          {data.results.length > 0 && <CarrierSearchResults results={data.results} />}
        </>
      )}
    </div>
  )
}
