import { LayoutDashboard, Radar, Search, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { BackgroundSpotlight } from './BackgroundSpotlight'

function NavItem({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string
  end?: boolean
  icon: LucideIcon
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
          isActive
            ? 'bg-violet-50 font-medium text-violet-700'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  )
}

export function AppLayout() {
  return (
    <div className="relative isolate min-h-screen">
      <BackgroundSpotlight />
      {/* The bar stays white on the dark theme, so it uses Tailwind's standard gray / violet
          (the slate scale is redefined for the dark surface in index.css). */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <NavLink
            to="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-gray-900"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]">
              <Radar className="size-4" aria-hidden />
            </span>
            CarrierIQ
          </NavLink>
          <nav className="flex gap-1 text-sm">
            <NavItem to="/" end icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/search" icon={Search} label="Search" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
