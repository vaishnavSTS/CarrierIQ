import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ManageSubscriptionButton } from '../../features/billing/ManageSubscriptionButton'
import { useLogout, useMe } from '../../hooks/useAuth'
import { SHOW_FROM, type HeaderBreakpoint } from './headerBreakpoint'
import { ROLE_LABELS } from './roleLabels'
import { ThemeToggle } from './ThemeToggle'

/** Theme switch, then the logged-in user's name, organization and role, with a log-out button.
 * Wide screens only (from `from`, the width where the header's links fit); narrower screens have
 * the same in MobileMenu. */
export function UserMenu({ from = 'lg' }: { from?: HeaderBreakpoint }) {
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  if (!user) return null

  return (
    <div className={`ml-auto hidden items-center gap-3 text-sm ${SHOW_FROM[from]}`}>
      <ThemeToggle />
      <div className="text-right leading-tight">
        <div className="font-medium text-slate-900">{user.full_name}</div>
        <div className="text-xs text-slate-500">
          {user.organization_name} · {ROLE_LABELS[user.role]}
        </div>
      </div>
      <ManageSubscriptionButton className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50" />
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
        disabled={logout.isPending}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
        Log out
      </button>
    </div>
  )
}
