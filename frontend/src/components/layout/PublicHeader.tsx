import { ArrowRight, Menu, Phone, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { audienceOfPath, type Audience } from '../../features/audience/audience'
import { STS_CONTACT } from '../../features/carrier-profile/packet/contact'
import { homeFor, useMe } from '../../hooks/useAuth'
import { formatPhone } from '../../utils/format'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

/** The visitor's own sign-up and login pages (carrier, broker or insurance agent). */
const ACCOUNT: Record<Audience, { logIn: string; signUp: string }> = {
  carrier: { logIn: '/login', signUp: '/register' },
  broker: { logIn: '/broker/login', signUp: '/broker/register' },
  agent: { logIn: '/insurance/login', signUp: '/insurance/register' },
}

const MENU: { to: string; label: string }[] = [
  { to: '/methodology', label: 'How the score works' },
  { to: '/contact', label: 'Contact' },
]

const DEMO = '/contact?demo=1'

/**
 * The public pages' header: a thin announcement bar with STS's phone number, then the logo,
 * the menu, Log in, Free trial and Schedule a demo. Below `xl` the menu folds into a ☰ panel.
 * Log in and Create account go to the open page's audience (carrier, broker or agent).
 */
export function PublicHeader() {
  const { data: user } = useMe()
  const { pathname } = useLocation()
  const account = ACCOUNT[audienceOfPath(pathname)]
  // The page the menu was opened on: it closes by itself when a link changes the page.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const phone = formatPhone(STS_CONTACT.phone)

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  const portal = user && (
    <Link
      to={homeFor(user.portal)}
      className="rounded-lg bg-cta px-3 py-2 text-sm font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
    >
      Open {user.portal === 'internal' ? 'dashboard' : 'my portal'}
    </Link>
  )

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-[#060d24] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-xs sm:text-[13px]">
          <Link to="/try" className="group flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#060d24]">
              New
            </span>
            <span className="truncate text-white/90 group-hover:text-white">
              Try the Safety Score Report free on any carrier
            </span>
            <ArrowRight
              className="hidden size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block"
              aria-hidden
            />
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            <a
              href={`tel:+1${STS_CONTACT.phone}`}
              className="flex items-center gap-1.5 font-medium text-white/90 hover:text-white"
            >
              <Phone className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{phone}</span>
              <span className="sm:hidden">Call</span>
            </a>
            <Link to="/contact" className="hidden text-white/70 hover:text-white md:block">
              Contact
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Brand to="/" />

          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 text-sm xl:flex">
            {MENU.filter((m) => m.to !== '/contact').map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={isActive(to) ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${
                  isActive(to)
                    ? 'bg-slate-100 font-medium text-slate-950'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm">
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            {user ? (
              <span className="hidden sm:block">{portal}</span>
            ) : (
              <>
                <Link
                  to={account.logIn}
                  className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-950 sm:block"
                >
                  Log in
                </Link>
                <Link
                  to="/try"
                  className="rounded-lg px-3 py-2 font-medium text-slate-900 ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
                >
                  Free trial
                </Link>
                <Link
                  to={DEMO}
                  className="hidden rounded-lg bg-cta px-3 py-2 font-medium text-cta-ink shadow-sm transition-colors hover:bg-cta-hover active:bg-cta-active md:block"
                >
                  Schedule a demo
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpenOn(open ? null : pathname)}
              aria-expanded={open}
              aria-controls="public-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 xl:hidden"
            >
              {open ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {open && (
          <nav
            id="public-menu"
            aria-label="Menu"
            className="border-t border-slate-200 bg-canvas px-4 pb-5 pt-2 xl:hidden"
          >
            <ul className="mx-auto max-w-7xl">
              {MENU.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    aria-current={isActive(to) ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-3 text-base ${
                      isActive(to)
                        ? 'bg-slate-100 font-medium text-slate-950'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mx-auto mt-3 grid max-w-7xl gap-2 sm:grid-cols-2">
              {user ? (
                portal
              ) : (
                <>
                  <Link
                    to={DEMO}
                    className="rounded-lg bg-cta px-4 py-3 flex justify-center font-medium text-cta-ink"
                  >
                    Schedule a demo
                  </Link>
                  <Link
                    to={account.signUp}
                    className="rounded-lg px-4 py-3 flex justify-center font-medium text-slate-900 ring-1 ring-slate-300"
                  >
                    Create account
                  </Link>
                  <Link
                    to={account.logIn}
                    className="rounded-lg px-4 py-3 flex justify-center text-slate-700 sm:col-span-2"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
            <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between border-t border-slate-200 pt-3 text-sm text-slate-600 sm:hidden">
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
