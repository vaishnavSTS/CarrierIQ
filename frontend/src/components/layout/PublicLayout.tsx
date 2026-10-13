import { Link, Outlet } from 'react-router-dom'

import { homeFor, useMe } from '../../hooks/useAuth'
import { BackgroundSpotlight } from './BackgroundSpotlight'
import { Brand } from './Brand'

/** Landing, login and sign-up pages: no login needed. */
export function PublicLayout() {
  const { data: user } = useMe()

  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <BackgroundSpotlight />
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Brand to="/" />
          <nav className="ml-auto flex items-center gap-2 text-sm">
            {user ? (
              <Link
                to={homeFor(user.portal)}
                className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-500"
              >
                Open {user.portal === 'internal' ? 'dashboard' : 'my portal'}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-500"
                >
                  Create account
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
        CarrierIQ by STS · Built on public FMCSA and NHTSA data · Not affiliated with FMCSA
      </footer>
    </div>
  )
}
