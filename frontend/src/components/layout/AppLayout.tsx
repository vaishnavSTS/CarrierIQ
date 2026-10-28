import {
  ClipboardList,
  Columns3,
  FileSearch,
  Gauge,
  LayoutDashboard,
  ReceiptText,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { NewSignupBanner } from '../../features/accounts/NewSignupBanner'
import { useCompareList } from '../../features/compare/compareContext'
import { CompareProvider } from '../../features/compare/CompareProvider'
import { CompareTray } from '../../features/compare/CompareTray'
import { useMe } from '../../hooks/useAuth'
import { useNewAccountCount } from '../../hooks/useAccounts'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { MobileMenu } from './MobileMenu'
import { UserMenu } from './UserMenu'

function NavItem({
  to,
  end,
  icon: Icon,
  label,
  badge = 0,
}: {
  to: string
  end?: boolean
  icon: LucideIcon
  label: string
  /** e.g. new sign-ups not seen yet; hidden at 0 */
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
          isActive
            ? 'bg-accent-soft font-medium text-accent-strong'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
      {badge > 0 && (
        <span className="rounded-full bg-amber-700 px-1.5 text-xs font-semibold text-surface">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

function CompareNavItem() {
  const count = useCompareList()?.usdots.length ?? 0
  return <NavItem to="/compare" icon={Columns3} label="Compare" badge={count} />
}

/** Internal portal frame (STS staff). */
export function AppLayout() {
  return (
    <CompareProvider page="/compare">
      <AppFrame />
    </CompareProvider>
  )
}

function AppFrame() {
  const { data: me } = useMe()
  const newAccounts = useNewAccountCount()
  const links = (
    <>
      <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
      <CompareNavItem />
      <NavItem to="/dataqs" icon={FileSearch} label="DataQs" />
      <NavItem to="/high-iss" icon={Gauge} label="High Safety Score" />
      <NavItem to="/service-requests" icon={ClipboardList} label="Service requests" />
      <NavItem to="/invoices" icon={ReceiptText} label="Invoices" />
      {me?.role === 'STS_ADMIN' && (
        <NavItem to="/accounts" icon={UserCheck} label="Accounts" badge={newAccounts} />
      )}
    </>
  )

  return (
    <div className="relative isolate min-h-screen">
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
          <Brand to="/dashboard" />
          <nav className="hidden gap-1 text-sm sm:flex">{links}</nav>
          <UserMenu />
          <MobileMenu>{links}</MobileMenu>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24">
        {me?.role === 'STS_ADMIN' && <NewSignupBanner />}
        <Outlet />
      </main>
      <CompareTray />
    </div>
  )
}
