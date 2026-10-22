import { Link, Outlet } from 'react-router-dom'

import { homeFor, useMe } from '../../hooks/useAuth'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

/** Landing, login and sign-up pages: no login needed. */
export function PublicLayout() {
  const { data: user } = useMe()

  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to="/" />
          <nav className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm">
            {/* Phones: room for the buttons; the theme follows the device there. */}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
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
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-cta px-3 py-1.5 font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
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
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        CarrierSafetyScan by STS · Built on public FMCSA and NHTSA data
      </footer>
    </div>
  )
}
