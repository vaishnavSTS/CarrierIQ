import { FilePlus2, Globe, Mail, Phone, Tag, Users } from 'lucide-react'

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
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">DataQs requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Believe an inspection or violation on your record is wrong? STS can prepare and file a
          DataQs request with FMCSA on your behalf and track it to a decision.
        </p>
      </div>
      {/* The price, made hard to miss: each inspection challenged is its own $50 request. */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-5 text-white shadow-lg shadow-violet-500/25 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/15">
            <Tag className="size-6" aria-hidden />
          </span>
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">$50</span>
              <span className="text-lg font-semibold">per inspection</span>
            </p>
            <p className="text-sm text-white/90">
              To file a DataQs request. Each inspection you challenge is billed separately.
            </p>
          </div>
        </div>
        <a
          href="#start-request"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-base font-semibold text-violet-700 shadow-md hover:bg-violet-50"
        >
          <FilePlus2 className="size-5" aria-hidden />
          Start a request
        </a>
      </div>
      {/* 2 or more inspections: an STS specialist talks through the offers. */}
      <div className="-mt-3 flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-4 text-white shadow-lg shadow-violet-500/25 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-3 text-sm text-white/90">
          <Users className="size-5 shrink-0 text-white" aria-hidden />
          <span>
            <span className="font-semibold text-white">Filing 2 or more DataQs?</span> Ask a Sky
            Transport Solutions specialist about our offers.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
          <a
            href="tel:+18004989820"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-white hover:bg-white/25"
          >
            <Phone className="size-4" aria-hidden />
            (800) 498-9820
          </a>
          <a
            href="mailto:info@skytransportsolutions.com"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-white hover:bg-white/25"
          >
            <Mail className="size-4" aria-hidden />
            info@skytransportsolutions.com
          </a>
          <a
            href="https://www.skytransportsolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-white hover:bg-white/25"
          >
            <Globe className="size-4" aria-hidden />
            skytransportsolutions.com
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
