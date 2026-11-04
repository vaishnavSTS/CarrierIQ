import { useSearchParams } from 'react-router-dom'

import { SubscriptionPanel } from '../features/billing/SubscriptionPanel'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { BookingChecklist } from '../features/portal/broker/BookingChecklist'
import { BrokerageCard } from '../features/portal/broker/BrokerageCard'
import { CompareDesk } from '../features/portal/broker/CompareDesk'
import { PaperworkCard } from '../features/portal/broker/PaperworkCard'
import { VerdictLadder } from '../features/portal/broker/VerdictLadder'
import { BrokerHero } from '../features/portal/BrokerHero'
import { useBrokerOverview, useMe } from '../hooks/useAuth'
import { AgentHomePage } from './AgentHomePage'

/**
 * Broker portal home, laid out as a vetting desk: the search band (?q=…) and its results, then the
 * compare desk as the main work area beside a rail with how carriers are graded, the paperwork
 * checklist for the load and the brokerage's own FMCSA details; before a search, what to check.
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

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <CompareDesk />
          {!query && <BookingChecklist />}
        </div>
        <aside className="space-y-6" aria-label="Booking tools">
          <VerdictLadder />
          <PaperworkCard />
          <BrokerageCard
            brokerage={brokerage}
            fallbackName={brokerageName}
            loading={brokerageLoading}
          />
        </aside>
      </div>

      <SubscriptionPanel />
    </div>
  )
}
