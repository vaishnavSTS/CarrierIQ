import { LogOut, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { ManageSubscriptionButton } from '../../features/billing/ManageSubscriptionButton'
import { useLogout, useMe } from '../../hooks/useAuth'
import { ROLE_LABELS } from './roleLabels'
import { ThemeToggle } from './ThemeToggle'

/**
 * Phones only: a menu button that opens the page links (`children`), who is logged in, the theme
 * switch and Log out, below the header. It closes when a link is chosen, on Escape, or on a tap
 * outside it. Wider screens show the links and the user menu in the header itself.
 */
export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  // A link was chosen: the page changes, so the menu closes.
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  }

  return (
    <div ref={root} className="ml-auto sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {open && (
        <div
          id="mobile-menu"
          onClick={closeOnLink}
          className="absolute inset-x-0 top-full border-b border-slate-200 bg-canvas shadow-lg"
        >
          <nav className="flex flex-col gap-1 px-4 py-3 text-base">{children}</nav>
          {user && (
            <div className="space-y-3 border-t border-slate-200 px-4 py-3">
              <div className="leading-tight">
                <div className="font-medium text-slate-900">{user.full_name}</div>
                <div className="text-sm text-slate-600">
                  {user.organization_name} · {ROLE_LABELS[user.role]}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                Theme
                <ThemeToggle />
              </div>
              <ManageSubscriptionButton className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50" />
              <button
                type="button"
                onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
                disabled={logout.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <LogOut className="size-4" aria-hidden />
                Log out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
