import { ApiError } from '../../api/client'
import { useCarrierSearch } from '../../hooks/useCarrierSearch'
import type { SearchKind } from '../../types/carrier'
import { CarrierSearchResults } from './CarrierSearchResults'

const KIND_LABEL: Record<SearchKind, string> = {
  usdot: 'USDOT number',
  docket: 'docket number',
  name: 'carrier name',
}

/** Results of a portal carrier search (?q=…): loading note, error, count and the list. */
export function SearchResultsPanel({ query }: { query: string }) {
  const { data, error, isFetching } = useCarrierSearch(query)
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
      {isFetching && (
        <p className="text-sm text-slate-600" role="status">
          Searching… a carrier not yet in CarrierSafetyScan is loaded from FMCSA first, which can
          take a few seconds.
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
    </section>
  )
}
