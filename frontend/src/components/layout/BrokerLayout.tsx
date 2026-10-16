import { Columns3, Search } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { useCompareList } from '../../features/compare/compareContext'
import { CompareProvider } from '../../features/compare/CompareProvider'
import { CompareTray } from '../../features/compare/CompareTray'
import { PortalModeContext } from '../../hooks/usePortalMode'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${
    isActive ? 'bg-sky-50 font-medium text-sky-700' : 'text-gray-600 hover:text-gray-900'
  }`
}

function CompareNavLink() {
  const count = useCompareList()?.usdots.length ?? 0
  return (
    <NavLink to="/broker/compare" className={navClass}>
      <Columns3 className="size-4" aria-hidden />
      Compare
      {count > 0 && (
        <span className="rounded-full bg-sky-600 px-1.5 text-xs font-medium text-white tabular-nums">
          {count}
        </span>
      )}
    </NavLink>
  )
}

/** Broker portal frame: search and compare carriers. */
export function BrokerLayout() {
  return (
    <CompareProvider>
      <div className="relative isolate min-h-screen">
        <BackgroundSpotlight />
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
            <Brand to="/broker" />
            <span className="hidden rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 sm:inline">
              Broker portal
            </span>
            <nav className="ml-2 flex items-center gap-1 text-sm sm:ml-4">
              <NavLink to="/broker" end className={navClass}>
                <Search className="size-4" aria-hidden />
                Search
              </NavLink>
              <CompareNavLink />
            </nav>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 pb-24">
          <PortalModeContext.Provider value="broker">
            <Outlet />
          </PortalModeContext.Provider>
        </main>
        <CompareTray />
      </div>
    </CompareProvider>
  )
}
