import { useSearchParams } from 'react-router-dom'

import { SubscriptionPanel } from '../features/billing/SubscriptionPanel'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { AgentCompareList } from '../features/portal/agent/AgentCompareList'
import { AgentHero } from '../features/portal/agent/AgentHero'
import { LiabilityMinimums } from '../features/portal/agent/LiabilityMinimums'
import { UnderwritingChecklist } from '../features/portal/agent/UnderwritingChecklist'
import { useBrokerOverview, useMe } from '../hooks/useAuth'

/**
 * Insurance agent home (broker portal, role INSURANCE_AGENT): welcome and carrier search (?q=…)
 * at the top. Before a search, the compare list, which carrier tab answers each underwriting
 * question, and the federal liability minimums; after one, the results.
 */
export function AgentHomePage() {
  const { data: user } = useMe()
  // The agency as given at sign-up, with its NPN (agencies have no MC or USDOT).
  const { data: agency } = useBrokerOverview()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''

  return (
    <div className="space-y-8">
      <AgentHero
        firstName={user?.full_name.split(' ')[0]}
        agencyName={agency?.organization_name ?? user?.organization_name ?? 'Your agency'}
        npn={agency?.license_number}
        guideLink={!query}
      >
        {/* key: reset the box when the URL query changes (e.g. back button) */}
        <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />
      </AgentHero>

      {query ? (
        <SearchResultsPanel query={query} />
      ) : (
        <>
          <AgentCompareList />
          <UnderwritingChecklist />
          <LiabilityMinimums />
          <p className="text-xs text-slate-500">
            Carrier Safety Scan shows what FMCSA’s public records say and flags what usually needs a
            closer look. It does not approve or decline a carrier: the underwriting decision stays
            with you.
          </p>
        </>
      )}
      <SubscriptionPanel />
    </div>
  )
}
