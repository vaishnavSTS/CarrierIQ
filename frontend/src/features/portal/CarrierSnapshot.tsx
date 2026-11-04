import { useCarrierAuthority } from '../../hooks/useCarrierAuthority'
import { useCarrierProfile } from '../../hooks/useCarrierProfile'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import { useDataQsCases } from '../../hooks/useDataQs'
import { useCarrierNetwork } from '../../hooks/useNetwork'
import { ActionCenter } from './carrier/ActionCenter'
import { BrokerView } from './carrier/BrokerView'
import { ComingUp } from './carrier/ComingUp'
import { CompanyPlate } from './carrier/CompanyPlate'
import { actionItems } from './carrier/actionItems'
import { IssCard } from './carrier/IssCard'
import { RegistrationCard } from './carrier/RegistrationCard'
import { RoadsideCard } from './carrier/RoadsideCard'
import { SkyServices } from './carrier/SkyServices'
import { TabLinks } from './carrier/TabLinks'
import { CARD } from './carrier/ui'

/**
 * Carrier portal home, one carrier: the company plate, then what a broker's booking check says
 * about it beside its Estimated ISS, its fix list with roadside and registration cards beside the
 * dates coming up, and the services Sky can handle. All from the same FMCSA records brokers check.
 */
export function CarrierSnapshot({
  usdotNumber,
  firstName,
}: {
  usdotNumber: number
  firstName: string | undefined
}) {
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

  const todo = items.filter((i) => i.kind === 'flag' || i.kind === 'dataqs')
  const dates = items.filter((i) => i.kind === 'mcs150' || i.kind === 'renewal')
  const openCases = (dataqs.data?.cases ?? []).filter(
    (c) => c.usdot_number === usdotNumber && c.work_status !== 'CLOSED',
  ).length

  return (
    <section id={`carrier-${usdotNumber}`} className="scroll-mt-20 space-y-4">
      <CompanyPlate carrier={carrier} firstName={firstName} page={page} openCases={openCases} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BrokerView usdotNumber={usdotNumber} page={page} />
        </div>
        <IssCard
          iss={safety.data?.estimated_iss}
          loading={safety.isPending}
          to={`${page}?tab=safety`}
          index={2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <ActionCenter
            items={todo}
            records={network.isPending ? 'checking' : network.isError ? 'failed' : 'ready'}
            usdotNumber={usdotNumber}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <RoadsideCard
              safety={carrier.safety}
              crashes={safety.data?.crashes}
              to={`${page}?tab=safety`}
              index={4}
            />
            <RegistrationCard
              profile={carrier}
              network={network.data}
              to={`${page}?tab=authority`}
              index={4}
            />
          </div>
        </div>
        <div className="lg:sticky lg:top-6">
          <ComingUp items={dates} />
        </div>
      </div>

      <SkyServices page={page} />
      <TabLinks page={page} index={6} />

      <p className="text-xs text-slate-500">
        The same FMCSA records brokers check. Flags are what brokers’ checks commonly react to, not
        a finding about your company.
      </p>
    </section>
  )
}
