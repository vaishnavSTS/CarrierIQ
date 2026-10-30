import { FileSearch, Search, Truck } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { SubscriptionGate } from '../../features/billing/SubscriptionGate'
import { PortalModeContext } from '../../hooks/usePortalMode'
import { useClientSearchEnabled } from '../../hooks/useAuth'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { ScrollToTop } from './ScrollToTop'
import { Brand } from './Brand'
import { MobileMenu } from './MobileMenu'
import { UserMenu } from './UserMenu'

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 ${
    isActive
      ? 'bg-accent-soft font-medium text-accent-strong'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
  }`
}

/** Client portal frame: their own carriers, DataQs requests, and search while it is on. */
export function PortalLayout() {
  const searchEnabled = useClientSearchEnabled()
  const links = (
    <>
      <NavLink to="/portal" end className={navClass}>
        <Truck className="size-4" aria-hidden />
        My carriers
      </NavLink>
      <NavLink to="/portal/dataqs" className={navClass}>
        <FileSearch className="size-4" aria-hidden />
        DataQs
      </NavLink>
      {searchEnabled && (
        <NavLink to="/portal/search" className={navClass}>
          <Search className="size-4" aria-hidden />
          Search carriers
        </NavLink>
      )}
    </>
  )
  return (
    <div className="relative isolate min-h-screen">
      <ScrollToTop />
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to="/portal" />
          <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 sm:inline">
            Client portal
          </span>
          <nav className="ml-4 hidden items-center gap-1 text-sm lg:flex">{links}</nav>
          <UserMenu />
          <MobileMenu>{links}</MobileMenu>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PortalModeContext.Provider value="client">
          <SubscriptionGate>
            <Outlet />
          </SubscriptionGate>
        </PortalModeContext.Provider>
      </main>
    </div>
  )
}
