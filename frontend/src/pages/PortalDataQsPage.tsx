import { DataQsCaseList } from '../features/dataqs/DataQsCaseList'
import { DataQsIntro } from '../features/dataqs/DataQsIntro'
import { DataQsStartRequest } from '../features/dataqs/DataQsStartRequest'
import { useDataQsCases } from '../hooks/useDataQs'

/** Client portal DataQs: the company's requests, and where to start a new one from an inspection. */
export function PortalDataQsPage() {
  const { data } = useDataQsCases()
  // Explained up front until the company has a request of its own; then folded away.
  const hasRequests = (data?.cases.length ?? 0) > 0
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">DataQs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Believe an inspection or violation on your record is wrong? STS can prepare and file a
          DataQs request with FMCSA on your behalf and track it to a decision.
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Your requests</h2>
        <DataQsCaseList
          showCompany={false}
          empty="No requests yet. Start one from an inspection below."
        />
      </section>
      <DataQsStartRequest />
      <DataQsIntro audience="carrier" folded={hasRequests} />
    </div>
  )
}
