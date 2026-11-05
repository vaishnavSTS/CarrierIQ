import { Outlet } from 'react-router-dom'

import { SubscriptionGate } from '../../features/billing/SubscriptionGate'
import { useClientSearchEnabled } from '../../hooks/useAuth'
import { PortalModeContext } from '../../hooks/usePortalMode'
import { PortalShell, type PortalNavItem } from './PortalShell'

/** Carrier (client) portal frame: their own carriers, DataQs requests, and search while it is on. */
export function PortalLayout() {
  const searchEnabled = useClientSearchEnabled()
  const nav: PortalNavItem[] = [
    { to: '/portal', label: 'My carriers', end: true },
    { to: '/portal/dataqs', label: 'DataQs' },
    ...(searchEnabled ? [{ to: '/portal/search', label: 'Search carriers' }] : []),
  ]
  return (
    <PortalShell tone="carrier" home="/portal" label="Carrier portal" nav={nav}>
      <PortalModeContext.Provider value="client">
        <SubscriptionGate>
          <Outlet />
        </SubscriptionGate>
      </PortalModeContext.Provider>
    </PortalShell>
  )
}
