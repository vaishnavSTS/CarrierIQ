import { useState } from 'react'

import { DataQsStaffQueue } from '../features/dataqs/staff/DataQsStaffQueue'
import { DataQsSupervisorView } from '../features/dataqs/staff/DataQsSupervisorView'
import { useMe } from '../hooks/useAuth'

type View = 'queue' | 'supervisor'

/** Internal portal DataQs: STS staff assess, file and track carriers' DataQs requests. */
export function DataQsPage() {
  const { data: me } = useMe()
  const [view, setView] = useState<View>('queue')
  const supervisor = me?.role === 'STS_ADMIN' && view === 'supervisor'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DataQs requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carriers’ requests to correct FMCSA safety records: assessment, filing, agency
          correspondence and decisions.
        </p>
      </div>
      {me?.role === 'STS_ADMIN' && (
        <div className="flex gap-1 text-sm" role="tablist" aria-label="DataQs view">
          {(
            [
              ['queue', 'Work queue'],
              ['supervisor', 'Supervisor'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
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
      )}
      {supervisor ? <DataQsSupervisorView /> : <DataQsStaffQueue />}
    </div>
  )
}
