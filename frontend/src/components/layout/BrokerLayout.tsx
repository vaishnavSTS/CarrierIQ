import { Columns3, Receipt, Search } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { useCompareList } from '../../features/compare/compareContext'
import { CompareProvider } from '../../features/compare/CompareProvider'
import { CompareTray } from '../../features/compare/CompareTray'
import { SubscriptionGate } from '../../features/billing/SubscriptionGate'
import { PortalModeContext } from '../../hooks/usePortalMode'
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

function CompareNavLink() {
  const count = useCompareList()?.usdots.length ?? 0
  return (
    <NavLink to="/broker/compare" className={navClass}>
      <Columns3 className="size-4" aria-hidden />
      Compare
      {count > 0 && (
        <span className="rounded-full bg-sky-600 px-1.5 text-xs font-medium text-surface tabular-nums">
          {count}
        </span>
      )}
    </NavLink>
  )
}

/** Broker portal frame: search and compare carriers. */
export function BrokerLayout() {
  const links = (
    <>
      <NavLink to="/broker" end className={navClass}>
        <Search className="size-4" aria-hidden />
        Search
      </NavLink>
      <CompareNavLink />
      <NavLink to="/broker/invoices" className={navClass}>
        <Receipt className="size-4" aria-hidden />
        Invoices
      </NavLink>
    </>
  )
  return (
    <CompareProvider page="/broker/compare">
      <div className="relative isolate min-h-screen">
        <ScrollToTop />
        <BackgroundSpotlight />
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
            <Brand to="/broker" />
            <span className="hidden rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 sm:inline">
              Broker portal
            </span>
            <nav className="ml-4 hidden items-center gap-1 text-sm lg:flex">{links}</nav>
            <UserMenu />
            <MobileMenu>{links}</MobileMenu>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 pb-24">
          <PortalModeContext.Provider value="broker">
            <SubscriptionGate>
              <Outlet />
            </SubscriptionGate>
          </PortalModeContext.Provider>
        </main>
        <CompareTray />
      </div>
    </CompareProvider>
  )
}
