import { Columns3, MapPinned, Receipt, Search } from 'lucide-react'
import { Outlet } from 'react-router-dom'

import { SubscriptionGate } from '../../features/billing/SubscriptionGate'
import { useCompareList } from '../../features/compare/compareContext'
import { CompareProvider } from '../../features/compare/CompareProvider'
import { CompareTray } from '../../features/compare/CompareTray'
import { useMe } from '../../hooks/useAuth'
import { PortalModeContext } from '../../hooks/usePortalMode'
import { PortalShell } from './PortalShell'

/** Broker portal frame (brokers and insurance agents): search and compare carriers. */
export function BrokerLayout() {
  return (
    <CompareProvider page="/broker/compare">
      <BrokerFrame />
    </CompareProvider>
  )
}

function BrokerFrame() {
  const { data: me } = useMe()
  const compared = useCompareList()?.usdots.length ?? 0
  return (
    <PortalShell
      tone={me?.role === 'INSURANCE_AGENT' ? 'agent' : 'broker'}
      home="/broker"
      label={me?.role === 'INSURANCE_AGENT' ? 'Insurance agent portal' : 'Broker portal'}
      nav={[
        { to: '/broker', label: 'Search carriers', icon: Search, end: true },
        { to: '/broker/compare', label: 'Compare', icon: Columns3, badge: compared },
        { to: '/broker/map', label: 'Carrier map', icon: MapPinned },
        { to: '/broker/invoices', label: 'Invoices', icon: Receipt },
      ]}
    >
      <PortalModeContext.Provider value="broker">
        <SubscriptionGate>
          <Outlet />
        </SubscriptionGate>
      </PortalModeContext.Provider>
      <CompareTray />
    </PortalShell>
  )
}
