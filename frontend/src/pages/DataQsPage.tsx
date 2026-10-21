import { DataQsIntro } from '../features/dataqs/DataQsIntro'
import { DataQsStaffQueue } from '../features/dataqs/staff/DataQsStaffQueue'

/** Internal portal DataQs: STS staff assess, file and track carriers' DataQs requests. */
export function DataQsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">DataQs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carriers’ requests to correct FMCSA safety records: assessment, filing, agency
          correspondence and decisions.
        </p>
      </div>
      <DataQsStaffQueue />
      <DataQsIntro audience="staff" />
    </div>
  )
}
