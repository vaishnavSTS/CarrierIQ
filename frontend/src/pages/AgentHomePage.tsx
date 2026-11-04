import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import { SubscriptionPanel } from '../features/billing/SubscriptionPanel'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SearchResultsPanel } from '../features/carrier-search/SearchResultsPanel'
import { AgentCompareList } from '../features/portal/agent/AgentCompareList'
import { AgentHero } from '../features/portal/agent/AgentHero'
import { LiabilityMinimums, NotInRecord } from '../features/portal/agent/LiabilityMinimums'
import { UnderwritingChecklist } from '../features/portal/agent/UnderwritingChecklist'
import { useBrokerOverview, useMe } from '../hooks/useAuth'

/** One numbered step of the underwriting file, with a line down to the next. */
function FileStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="relative grid gap-4 md:grid-cols-[3rem_minmax(0,1fr)]">
      <div className="hidden md:block">
        <span className="font-label grid size-12 place-items-center rounded-2xl bg-[var(--portal-ink)] text-base font-semibold text-[var(--portal-accent)]">
          {n}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-label text-[10.5px] uppercase tracking-[0.14em] text-accent-strong">
          Step {n}
        </p>
        <h2 className="mb-4 mt-1 text-2xl font-semibold text-slate-950">{title}</h2>
        {children}
      </div>
    </section>
  )
}

/**
 * Insurance agent home (broker portal, role INSURANCE_AGENT), laid out as an underwriting file:
 * the search (?q=…) beside the file's cover, any results, then the review in numbered steps
 * (the record tab by tab, the liability minimums, the decision) with the compare list and what the
 * public record can't answer pinned in the margin.
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

      {query && <SearchResultsPanel query={query} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-10">
          <FileStep n={1} title="Review the carrier’s record">
            <UnderwritingChecklist />
          </FileStep>
          <FileStep n={2} title="Check the coverage against the minimums">
            <LiabilityMinimums />
          </FileStep>
          <FileStep n={3} title="Make the call">
            <p className="max-w-3xl text-sm leading-relaxed text-slate-700">
              Carrier Safety Scan shows what FMCSA’s public records say and flags what usually needs
              a closer look. It does not approve or decline a carrier: the underwriting decision
              stays with you. Save the dated Safety Score Report with the file so you can show what
              you checked and when.
            </p>
          </FileStep>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-6" aria-label="Notes">
          <AgentCompareList />
          <NotInRecord />
        </aside>
      </div>

      <SubscriptionPanel />
    </div>
  )
}
