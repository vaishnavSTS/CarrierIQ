import { useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { CarrierSearchResults } from '../features/carrier-search/CarrierSearchResults'
import { BrokerGuide } from '../features/portal/BrokerGuide'
import { BrokerHero } from '../features/portal/BrokerHero'
import { useBrokerOverview, useMe } from '../hooks/useAuth'
import { useCarrierSearch } from '../hooks/useCarrierSearch'
import type { SearchKind } from '../types/carrier'

const KIND_LABEL: Record<SearchKind, string> = {
  usdot: 'USDOT number',
  docket: 'docket number',
  name: 'carrier name',
}

/**
 * Broker portal home: welcome and carrier search (?q=…) at the top. Before a search, what a
 * carrier profile shows and how to use it; after one, the results.
 */
export function BrokerHomePage() {
  const { data: user } = useMe()
  const { data: brokerage } = useBrokerOverview()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const { data, error, isFetching } = useCarrierSearch(query)

  return (
    <div className="space-y-8">
      <BrokerHero
        firstName={user?.full_name.split(' ')[0]}
        brokerageName={brokerage?.organization_name ?? user?.organization_name ?? 'Your brokerage'}
        brokerage={brokerage}
      >
        {/* key: reset the box when the URL query changes (e.g. back button) */}
        <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />
      </BrokerHero>

      {query ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
          {isFetching && (
            <p className="text-sm text-slate-600" role="status">
              Searching… a carrier not yet in CarrierIQ is loaded from FMCSA first, which can take a
              few seconds.
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
      ) : (
        <BrokerGuide />
      )}
    </div>
  )
}
