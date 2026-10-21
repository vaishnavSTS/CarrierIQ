import { DataQsComingSoon, DataQsIntro } from '../features/dataqs/DataQsIntro'

/** Client portal DataQs: ask STS to challenge a safety record the carrier believes is wrong. */
export function PortalDataQsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">DataQs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Believe an inspection or violation on your record is wrong? STS can prepare and file a
          DataQs request with FMCSA on your behalf and track it to a decision.
        </p>
      </div>
      <DataQsIntro audience="carrier" />
      <DataQsComingSoon>
        Your DataQs requests will appear here. Starting a request from your inspections is coming
        soon.
      </DataQsComingSoon>
    </div>
  )
}
