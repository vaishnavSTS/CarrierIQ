import { LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import logo from '../../assets/carriersafetyscan-logo.png'
import { ManageSubscriptionButton } from '../../features/billing/ManageSubscriptionButton'
import { useLogout, useMe } from '../../hooks/useAuth'
import { ROLE_LABELS } from './roleLabels'
import { ScrollToTop } from './ScrollToTop'
import { SiteFooter } from './SiteFooter'
import { TalkToSky } from './TalkToSky'
import { ThemeToggle } from './ThemeToggle'

export interface PortalNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Active only on this exact path (the portal's home) */
  end?: boolean
  /** A count shown beside the label */
  badge?: number
}

/**
 * The logged-in portals' frame: a deep-navy sidebar (logo, the portal's pages, and who is logged
 * in with the theme switch, subscription and log out) beside the page. On phones and tablets the
 * sidebar slides in from a menu button in a slim top bar. Uses the public site's type
 * (.portal-type in index.css); the Safety Score Report keeps the app font.
 */
export function PortalShell({
  home,
  label,
  nav,
  children,
}: {
  home: string
  /** "Broker portal", "Insurance agent portal" … */
  label: string
  nav: PortalNavItem[]
  children: ReactNode
}) {
  const { pathname } = useLocation()
  // The page the drawer was opened on: it closes by itself when a link changes the page.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenOn(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="portal-page portal-type relative isolate flex min-h-screen flex-col lg:pl-64 lg:[--sticky-top:0px]">
      <ScrollToTop />

      {/* Wide screens: the sidebar, always there. */}
      <aside className="portal-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 print:hidden lg:flex">
        <SidebarBody home={home} label={label} nav={nav} />
      </aside>

      {/* Phones and tablets: a slim bar, and the sidebar as a drawer. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-canvas/90 px-4 backdrop-blur print:hidden lg:hidden">
        <button
          type="button"
          onClick={() => setOpenOn(pathname)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="portal-drawer"
          className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link to={home} className="flex items-center gap-2">
          <img src={logo} alt="" className="size-8 object-contain" />
          <span className="brand-name text-base font-semibold text-slate-900">
            Carrier Safety Scan
          </span>
        </Link>
      </header>
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpenOn(null)}
            className="absolute inset-0 bg-[#060d24]/60 backdrop-blur-sm"
          />
          <aside
            id="portal-drawer"
            className="portal-sidebar relative flex h-full w-72 max-w-[85vw]"
          >
            <button
              type="button"
              onClick={() => setOpenOn(null)}
              aria-label="Close menu"
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
            >
              <X className="size-5" aria-hidden />
            </button>
            <SidebarBody home={home} label={label} nav={nav} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
        {children}
      </main>
      <SiteFooter />
      <TalkToSky />
    </div>
  )
}

function SidebarBody({ home, label, nav }: { home: string; label: string; nav: PortalNavItem[] }) {
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const initials = (user?.full_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <div className="flex w-full flex-col overflow-y-auto px-4 pb-4 pt-5">
      <Link to={home} className="flex items-center gap-2.5 px-2">
        <img src={logo} alt="" className="size-10 shrink-0 object-contain" />
        <span className="leading-tight">
          <span className="brand-name block text-[15px] font-semibold text-white">
            Carrier Safety Scan
          </span>
          <span className="block text-[11px] text-white/60">
            Powered by Sky Transport Solutions
          </span>
        </span>
      </Link>
      <span className="font-label mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
        {label}
      </span>

      <nav aria-label={label} className="mt-2 flex flex-col gap-1">
        {nav.map(({ to, label: text, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-white/12 font-semibold text-white'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-1 rounded-full bg-amber-300"
                  />
                )}
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1">{text}</span>
                {badge ? (
                  <span className="rounded-full bg-amber-300 px-1.5 text-xs font-semibold text-[#060d24] tabular-nums">
                    {badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-8">
        {user && (
          <div className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-300 text-sm font-semibold text-[#060d24]">
              {initials || '·'}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium text-white">
                {user.full_name}
              </span>
              <span className="block truncate text-xs text-white/60">
                {user.organization_name} · {ROLE_LABELS[user.role]}
              </span>
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-1 text-xs text-white/60">
          Theme
          <ThemeToggle />
        </div>
        <ManageSubscriptionButton className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-50" />
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
          disabled={logout.isPending}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-50"
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </button>
      </div>
    </div>
  )
}
