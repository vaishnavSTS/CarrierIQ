import { useSearchParams } from 'react-router-dom'

import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { BrokerGuide } from '../features/portal/BrokerGuide'
import { BrokerHero } from '../features/portal/BrokerHero'
import { useBrokerOverview, useMe } from '../hooks/useAuth'

/**
 * Broker portal home: welcome and carrier search (?q=…) at the top. Before a search, what a
 * carrier profile shows and how to use it; after one, the results.
 */
export function BrokerHomePage() {
  const { data: user } = useMe()
  const { data: brokerage } = useBrokerOverview()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''

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

      {query ? <SearchResultsPanel query={query} /> : <BrokerGuide />}
    </div>
  )
}
