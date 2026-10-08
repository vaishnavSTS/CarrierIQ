import { SystemStatusCard } from '../features/system-status/SystemStatusCard'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carrier search, recently viewed carriers and recent intelligence events arrive in later
          phases.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <label htmlFor="carrier-search" className="text-sm font-semibold text-slate-900">
            Carrier search
          </label>
          <input
            id="carrier-search"
            type="search"
            disabled
            placeholder="Search USDOT, MC, or Carrier Name (Phase 4)"
            className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
        </div>
        <SystemStatusCard />
      </div>
    </div>
  )
}
