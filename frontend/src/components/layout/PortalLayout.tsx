import { Search } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { PortalModeContext } from '../../hooks/usePortalMode'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${
    isActive ? 'bg-violet-50 font-medium text-violet-700' : 'text-gray-600 hover:text-gray-900'
  }`
}

/** Client portal frame: their own carriers, and search for any other. */
export function PortalLayout() {
  return (
    <div className="relative isolate min-h-screen">
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to="/portal" />
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
            Client portal
          </span>
          <nav className="ml-4 flex items-center gap-1 text-sm">
            <NavLink to="/portal" end className={navClass}>
              My carriers
            </NavLink>
            <NavLink to="/portal/search" className={navClass}>
              <Search className="size-4" aria-hidden />
              Search carriers
            </NavLink>
          </nav>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <PortalModeContext.Provider value="client">
          <Outlet />
        </PortalModeContext.Provider>
      </main>
    </div>
  )
}
