import { Link, Outlet, useLocation } from 'react-router-dom'

import { savedAudience, type Audience } from '../../features/audience/audience'

import { homeFor, useMe } from '../../hooks/useAuth'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { ScrollToTop } from './ScrollToTop'
import { SiteFooter } from './SiteFooter'
import { TalkToSky } from './TalkToSky'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

/** The visitor's own sign-up and login pages (carrier, broker or insurance agent). */
const ACCOUNT: Record<Audience, { logIn: string; signUp: string }> = {
  carrier: { logIn: '/login', signUp: '/register' },
  broker: { logIn: '/broker/login', signUp: '/broker/register' },
  agent: { logIn: '/insurance/login', signUp: '/insurance/register' },
}

/** Landing, login and sign-up pages: no login needed. */
export function PublicLayout() {
  const { data: user } = useMe()
  useLocation() // re-read the visitor's choice on every page change
  const account = ACCOUNT[savedAudience() ?? 'carrier']

  return (
    <div className="landing-page landing-rest relative isolate flex min-h-screen flex-col">
      <ScrollToTop />
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
          <Brand to="/" />
          <nav className="ml-auto flex items-center gap-1 whitespace-nowrap text-sm sm:gap-2">
            {/* Phones: room for the buttons; the theme follows the device there. */}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <Link
              to="/contact"
              className="hidden rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900 md:block"
            >
              Contact
            </Link>
            {user ? (
              <Link
                to={homeFor(user.portal)}
                className="rounded-lg bg-cta px-3 py-1.5 font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
              >
                Open {user.portal === 'internal' ? 'dashboard' : 'my portal'}
              </Link>
            ) : (
              <>
                <Link
                  to={account.logIn}
                  className="rounded-lg px-1.5 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900 sm:px-3"
                >
                  Log in
                </Link>
                <Link
                  to={account.signUp}
                  className="rounded-lg bg-cta px-2 py-1.5 sm:px-3 font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
                >
                  <span className="sm:hidden">Sign up</span>
                  <span className="hidden sm:inline">Create account</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <TalkToSky />
    </div>
  )
}
