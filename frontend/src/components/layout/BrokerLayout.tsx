import { Outlet } from 'react-router-dom'

import { PortalModeContext } from '../../hooks/usePortalMode'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'

/** Broker portal frame. */
export function BrokerLayout() {
  return (
    <div className="relative isolate min-h-screen">
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to="/broker" />
          <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            Broker portal
          </span>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PortalModeContext.Provider value="broker">
          <Outlet />
        </PortalModeContext.Provider>
      </main>
    </div>
  )
}
