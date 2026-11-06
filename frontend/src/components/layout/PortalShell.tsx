import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { MobileMenu } from './MobileMenu'
import { ScrollToTop } from './ScrollToTop'
import { SiteFooter } from './SiteFooter'
import { TalkToSky } from './TalkToSky'
import { UserMenu } from './UserMenu'

/** Which portal this is: sets data-portal, whose colours (index.css) the home pages use. */
export type PortalTone = 'carrier' | 'broker' | 'agent'

export interface PortalNavItem {
  to: string
  label: string
  /** Active only on this exact path (the portal's home) */
  end?: boolean
  /** A count shown beside the label */
  badge?: number
}

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 ${
    isActive
      ? 'bg-accent-soft font-medium text-accent-strong'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
  }`
}

/**
 * The logged-in portals' frame: a bar across the top (logo, the portal's name, its pages, and who
 * is logged in with the theme switch and log out), the page below it. Phones, tablets and small laptops
 * (below 1280px) get the pages and the user's menu behind a menu button. Uses the public site's type (.portal-type in
 * index.css); the Safety Score Report keeps the app font.
 */
export function PortalShell({
  tone,
  home,
  label,
  nav,
  children,
}: {
  tone: PortalTone
  home: string
  /** "Broker portal", "Insurance agent portal" … */
  label: string
  nav: PortalNavItem[]
  children: ReactNode
}) {
  const links = (
    <>
      {nav.map(({ to, label: text, end, badge }) => (
        <NavLink key={to} to={to} end={end} className={navClass}>
          {text}
          {badge ? (
            <span className="rounded-full bg-sky-600 px-1.5 text-xs font-medium text-surface tabular-nums">
              {badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </>
  )

  return (
    <div
      data-portal={tone}
      className="portal-page portal-type relative isolate flex min-h-screen flex-col"
    >
      <ScrollToTop />
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to={home} />
          <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 xl:inline">
            {label}
          </span>
          <nav aria-label={label} className="ml-4 hidden items-center gap-1 text-sm xl:flex">
            {links}
          </nav>
          <UserMenu from="xl" />
          <MobileMenu from="xl">{links}</MobileMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24">{children}</main>
      <SiteFooter />
      <TalkToSky />
    </div>
  )
}
