import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { SystemStatusCard } from '../features/system-status/SystemStatusCard'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recently viewed carriers and recent intelligence events arrive in later phases.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Carrier search</h2>
          <CarrierSearchBox autoFocus />
          <p className="mt-2 text-xs text-slate-500">
            Examples: <span className="font-mono">295017</span>,{' '}
            <span className="font-mono">MC139446</span>,{' '}
            <span className="font-mono">united moving</span>
          </p>
        </section>
        <SystemStatusCard />
      </div>
    </div>
  )
}
