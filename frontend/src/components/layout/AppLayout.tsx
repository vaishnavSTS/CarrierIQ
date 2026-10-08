import { NavLink, Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4">
          <NavLink to="/" className="text-base font-semibold tracking-tight text-slate-900">
            CarrierIQ
          </NavLink>
          <nav className="flex gap-6 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-medium text-slate-900' : 'text-slate-500 hover:text-slate-900'
              }
            >
              Dashboard
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
