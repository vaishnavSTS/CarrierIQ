import { Clock, Search } from 'lucide-react'

import { SubscriptionPanel } from '../features/billing/SubscriptionPanel'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { CarrierList } from '../features/portal/carrier/CarrierList'
import { DataQsPanel } from '../features/portal/carrier/DataQsPanel'
import { CARD } from '../features/portal/carrier/ui'
import { CarrierSnapshot } from '../features/portal/CarrierSnapshot'
import { ClientGuide } from '../features/portal/ClientGuide'
import { PortalHero } from '../features/portal/PortalHero'
import { useClientSearchEnabled, usePortalOverview, useMe } from '../hooks/useAuth'

/**
 * Carrier portal home, most relevant first: each of the company's carriers as it stands right now
 * (what needs attention, safety score, out-of-service rates, registration), its DataQs requests,
 * then what Carrier Safety Scan does for it.
 */
export function PortalHomePage() {
  const { data: user } = useMe()
  const { data, isPending, isError } = usePortalOverview()
  const searchEnabled = useClientSearchEnabled()
  const carriers = data?.carriers ?? []

  return (
    <div className="space-y-8">
      <PortalHero
        firstName={user?.full_name.split(' ')[0]}
        organizationName={data?.organization_name}
        carriers={data?.carriers}
      />

      {isPending && <p className="text-sm text-slate-500">Loading your carriers…</p>}
      {isError && (
        <p className={`${CARD} text-sm text-red-700`}>
          Couldn’t load your carriers. Try again shortly.
        </p>
      )}
      {data && carriers.length === 0 && (
        <section className={`${CARD} flex items-start gap-3 text-sm text-slate-600`}>
          <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <p>No carriers linked to your account yet. Contact STS to add your USDOT number.</p>
        </section>
      )}

      {carriers.length > 1 && <CarrierList carriers={carriers} />}

      {carriers.map((c) => (
        <CarrierSnapshot key={c.usdot_number} usdotNumber={c.usdot_number} />
      ))}

      {carriers.length > 0 && <DataQsPanel multipleCarriers={carriers.length > 1} />}

      {searchEnabled && (
        <section className={`${CARD} space-y-3`}>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Search className="size-4 text-slate-500" aria-hidden />
              Look up another carrier
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Any USDOT, MC number or name: a partner, a carrier you lease from, or a competitor.
            </p>
          </div>
          <CarrierSearchBox />
        </section>
      )}

      <ClientGuide />
      <SubscriptionPanel />
    </div>
  )
}
