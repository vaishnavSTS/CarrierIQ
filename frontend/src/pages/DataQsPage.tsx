import { useSearchParams } from 'react-router-dom'

import { DataQsStaffQueue } from '../features/dataqs/staff/DataQsStaffQueue'
import { DataQsStaffStartRequest } from '../features/dataqs/staff/DataQsStaffStartRequest'
import { DataQsSupervisorView } from '../features/dataqs/staff/DataQsSupervisorView'
import { useMe } from '../hooks/useAuth'

type View = 'queue' | 'start' | 'supervisor'

/** Internal portal DataQs: STS staff assess, file and track carriers' DataQs requests, and start
 * requests for any carrier. The view and searched USDOT live in the URL (?view=start&usdot=…),
 * so "Back" from a new request returns to the same carrier. */
export function DataQsPage() {
  const { data: me } = useMe()
  const [params, setParams] = useSearchParams()
  const admin = me?.role === 'STS_ADMIN'
  const requested = params.get('view')
  const view: View =
    requested === 'start' || (requested === 'supervisor' && admin) ? requested : 'queue'
  const usdot = Number(params.get('usdot'))
  const searched = Number.isInteger(usdot) && usdot > 0 ? usdot : null

  const tabs: [View, string][] = [
    ['queue', 'Work queue'],
    ['start', 'Start a request'],
    ...(admin ? ([['supervisor', 'Supervisor']] as [View, string][]) : []),
  ]
  const show = (next: View) => setParams(next === 'queue' ? {} : { view: next }, { replace: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DataQs requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carriers’ requests to correct FMCSA safety records: assessment, filing, agency
          correspondence and decisions.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label="DataQs view">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => show(id)}
            className={`rounded-md px-3 py-1.5 ${
              view === id
                ? 'bg-accent-soft font-medium text-accent-strong'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'supervisor' && <DataQsSupervisorView />}
      {view === 'start' && (
        <DataQsStaffStartRequest
          usdotNumber={searched}
          onSearch={(next) =>
            setParams(next ? { view: 'start', usdot: String(next) } : { view: 'start' })
          }
        />
      )}
      {view === 'queue' && <DataQsStaffQueue />}
    </div>
  )
}
