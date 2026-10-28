import { FilePlus2, Tag } from 'lucide-react'

import { DataQsCaseList } from '../features/dataqs/DataQsCaseList'
import { DataQsIntro } from '../features/dataqs/DataQsIntro'
import { DataQsStartRequest } from '../features/dataqs/DataQsStartRequest'
import { primaryButton } from '../features/dataqs/ui'
import { useDataQsCases } from '../hooks/useDataQs'

/** Client portal DataQs: the company's requests, and where to start a new one from an inspection. */
export function PortalDataQsPage() {
  const { data } = useDataQsCases()
  // Explained up front until the company has a request of its own; then folded away.
  const hasRequests = (data?.cases.length ?? 0) > 0
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">DataQs requests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Believe an inspection or violation on your record is wrong? STS can prepare and file a
            DataQs request with FMCSA on your behalf and track it to a decision.
          </p>
          {/* The price, made hard to miss: each inspection challenged is its own $50 request. */}
          <div className="mt-4 inline-flex items-center gap-4 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-5 py-3.5 text-white shadow-lg shadow-violet-500/25">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
              <Tag className="size-6" aria-hidden />
            </span>
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">$50</span>
                <span className="text-base font-semibold">per inspection</span>
              </p>
              <p className="text-sm text-white/90">
                To file a DataQs request. Each inspection you challenge is billed separately.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#start-request" className={`${primaryButton} inline-flex items-center gap-1.5`}>
            <FilePlus2 className="size-4" aria-hidden />
            Start a request
          </a>
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Your requests</h2>
        <DataQsCaseList
          showCompany={false}
          empty="No requests yet. Start one from an inspection below."
        />
      </section>
      <div id="start-request" className="scroll-mt-20">
        <DataQsStartRequest />
      </div>
      <DataQsIntro audience="carrier" folded={hasRequests} />
    </div>
  )
}
