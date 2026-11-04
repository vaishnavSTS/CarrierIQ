import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierAuthority } from '../../hooks/useCarrierAuthority'
import { useCarrierProfile } from '../../hooks/useCarrierProfile'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import { useDataQsCases } from '../../hooks/useDataQs'
import { useCarrierNetwork } from '../../hooks/useNetwork'
import { formatDateTime } from '../../utils/format'
import { statusTone } from '../../utils/status'
import { ActionCenter } from './carrier/ActionCenter'
import { actionItems } from './carrier/actionItems'
import { IssCard } from './carrier/IssCard'
import { RegistrationCard } from './carrier/RegistrationCard'
import { RoadsideCard } from './carrier/RoadsideCard'
import { TabLinks } from './carrier/TabLinks'
import { CARD, LABEL } from './carrier/ui'

/**
 * Carrier portal home: one of the company's carriers as it stands right now, from the same FMCSA
 * records brokers check. What needs them first (action center), then the Estimated ISS,
 * out-of-service rates and registration at a glance, each linking to the tab with the detail.
 */
export function CarrierSnapshot({ usdotNumber }: { usdotNumber: number }) {
  const profile = useCarrierProfile(usdotNumber)
  const network = useCarrierNetwork(usdotNumber)
  const safety = useCarrierSafety(usdotNumber)
  const authority = useCarrierAuthority(usdotNumber)
  const dataqs = useDataQsCases()
  const page = `/portal/carriers/${usdotNumber}`

  if (profile.isPending) {
    return (
      <section className={`${CARD} animate-pulse text-sm text-slate-500`}>
        Loading your carrier’s FMCSA record…
      </section>
    )
  }
  if (!profile.data) {
    return (
      <section className={`${CARD} text-sm text-red-700`}>
        Couldn’t load the FMCSA record for USDOT {usdotNumber}. Try again shortly.
      </section>
    )
  }

  const carrier = profile.data
  const items = actionItems({
    profile: carrier,
    network: network.data,
    renewals: authority.data?.renewals,
    cases: (dataqs.data?.cases ?? []).filter((c) => c.usdot_number === usdotNumber),
    page,
  })

  return (
    <section id={`carrier-${usdotNumber}`} className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className={`${LABEL} text-slate-500`}>Your carrier right now</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950 [overflow-wrap:anywhere]">
            {carrier.legal_name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <span>
              USDOT <span className="font-mono">{carrier.usdot_number}</span>
            </span>
            {carrier.registration_status && (
              <StatusBadge
                label={carrier.registration_status}
                tone={statusTone(carrier.registration_status)}
              />
            )}
            {carrier.last_refreshed_at && (
              <span className="text-xs text-slate-500">
                FMCSA data refreshed {formatDateTime(carrier.last_refreshed_at)}
              </span>
            )}
          </p>
        </div>
        <Link
          to={page}
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-[#101853] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1a2470]"
        >
          Open carrier page
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <ActionCenter
        items={items}
        records={network.isPending ? 'checking' : network.isError ? 'failed' : 'ready'}
        usdotNumber={usdotNumber}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <IssCard
          iss={safety.data?.estimated_iss}
          loading={safety.isPending}
          to={`${page}?tab=safety`}
          index={1}
        />
        <RoadsideCard
          safety={carrier.safety}
          crashes={safety.data?.crashes}
          to={`${page}?tab=safety`}
          index={2}
        />
        <RegistrationCard
          profile={carrier}
          network={network.data}
          to={`${page}?tab=authority`}
          index={3}
        />
      </div>

      <TabLinks page={page} index={4} />

      <p className="text-xs text-slate-500">
        The same FMCSA records brokers check. Flags are what brokers’ checks commonly react to, not
        a finding about your company.
      </p>
    </section>
  )
}
