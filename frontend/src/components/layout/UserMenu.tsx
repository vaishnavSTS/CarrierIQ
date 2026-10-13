import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useLogout, useMe } from '../../hooks/useAuth'
import type { UserRole } from '../../types/auth'

const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Account owner',
  CLIENT_USER: 'Viewer',
}

/** Logged-in user's name, organization and role, with a log-out button (white header bar). */
export function UserMenu() {
  const { data: user } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  if (!user) return null

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <div className="hidden text-right leading-tight sm:block">
        <div className="font-medium text-gray-900">{user.full_name}</div>
        <div className="text-xs text-gray-500">
          {user.organization_name} · {ROLE_LABELS[user.role]}
        </div>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}
        disabled={logout.isPending}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
        Log out
      </button>
    </div>
  )
}
