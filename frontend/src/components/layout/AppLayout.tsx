import { NavLink, Outlet } from 'react-router-dom'

import { NewSignupBanner } from '../../features/accounts/NewSignupBanner'
import { CompareProvider } from '../../features/compare/CompareProvider'
import { CompareTray } from '../../features/compare/CompareTray'
import { useMe } from '../../hooks/useAuth'
import { useNewAccountCount } from '../../hooks/useAccounts'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { PageMeta } from './PageMeta'
import { ScrollToTop } from './ScrollToTop'
import { Brand } from './Brand'
import { MobileMenu } from './MobileMenu'
import { UserMenu } from './UserMenu'

function NavItem({
  to,
  end,
  label,
  badge = 0,
}: {
  to: string
  end?: boolean
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
      {label}
      {badge > 0 && (
        <span className="rounded-full bg-amber-700 px-1.5 text-xs font-semibold text-surface">
          {badge}
        </span>
      )}
    </NavLink>
  )
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
      <NavItem to="/dashboard" label="Dashboard" />
      <NavItem to="/dataqs" label="DataQs" />
      <NavItem to="/high-iss" label="High Safety Score" />
      <NavItem to="/service-requests" label="Service requests" />
      <NavItem to="/invoices" label="Invoices" />
      {me?.role === 'STS_ADMIN' && (
        <>
          <NavItem to="/accounts" label="Accounts" badge={newAccounts} />
          <NavItem to="/monitored" label="Admin Monitored DOTs" />
        </>
      )}
    </>
  )

  return (
    <div className="portal-page relative isolate min-h-screen">
      <ScrollToTop />
      <PageMeta />
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
        {/* Wider than the page: the staff tabs fit in one row from 1536px (2xl). */}
        <div className="mx-auto flex h-14 max-w-[96rem] items-center gap-3 px-4">
          <Brand to="/dashboard" />
          <nav className="hidden gap-1 text-sm 2xl:flex">{links}</nav>
          <UserMenu from="2xl" />
          <MobileMenu from="2xl">{links}</MobileMenu>
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
