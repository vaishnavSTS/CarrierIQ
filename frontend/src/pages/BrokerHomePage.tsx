import { useSearchParams } from 'react-router-dom'

import { SubscriptionPanel } from '../features/billing/SubscriptionPanel'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { BookingChecklist } from '../features/portal/broker/BookingChecklist'
import { BrokerageCard } from '../features/portal/broker/BrokerageCard'
import { CompareDesk } from '../features/portal/broker/CompareDesk'
import { BrokerGuide } from '../features/portal/BrokerGuide'
import { BrokerHero } from '../features/portal/BrokerHero'
import { useBrokerOverview, useMe } from '../hooks/useAuth'
import { AgentHomePage } from './AgentHomePage'

/**
 * Broker portal home: welcome and carrier search (?q=…) at the top, then the results when there is
 * a search. Below: the compare list with each carrier's booking check, the brokerage's own FMCSA
 * details, and (before a search) what to check before booking and how the portal works.
 */
export function BrokerHomePage() {
  const { data: user } = useMe()
  const { data: brokerage, isPending: brokerageLoading } = useBrokerOverview()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const brokerageName = brokerage?.organization_name ?? user?.organization_name ?? 'Your brokerage'

  // Insurance agents share the broker routes but get their own home (no booking check for them).
  if (user?.role === 'INSURANCE_AGENT') return <AgentHomePage />

  return (
    <div className="space-y-6">
      <BrokerHero
        firstName={user?.full_name.split(' ')[0]}
        brokerageName={brokerageName}
        brokerage={brokerage}
      >
        {/* key: reset the box when the URL query changes (e.g. back button) */}
        <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />
      </BrokerHero>

      {query && <SearchResultsPanel query={query} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CompareDesk />
        <BrokerageCard
          brokerage={brokerage}
          fallbackName={brokerageName}
          loading={brokerageLoading}
        />
      </div>

      {!query && (
        <>
          <BookingChecklist />
          <BrokerGuide />
        </>
      )}
      <SubscriptionPanel />
    </div>
  )
}
