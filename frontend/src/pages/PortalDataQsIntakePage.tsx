import { Link, useSearchParams } from 'react-router-dom'

import { DataQsIntakeWizard } from '../features/dataqs/intake/DataQsIntakeWizard'

/** /portal/dataqs/new?usdot=…&inspection=…: start a DataQs request from an inspection. */
export function PortalDataQsIntakePage() {
  const [params] = useSearchParams()
  const usdot = Number(params.get('usdot'))
  const inspection = params.get('inspection') ?? ''
  const valid = Number.isInteger(usdot) && usdot > 0 && inspection.length > 0

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={valid ? `/portal/carriers/${usdot}?tab=safety` : '/portal/dataqs'}
          className="text-sm text-accent-strong hover:underline"
        >
          ← Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Request a data review</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tell STS what is wrong with this inspection. Your answers open a draft case; nothing is
          sent to FMCSA until you approve the exact request.
        </p>
      </div>
      {valid ? (
        <DataQsIntakeWizard
          key={`${usdot}-${inspection}`}
          usdotNumber={usdot}
          inspectionId={inspection}
        />
      ) : (
        <p className="text-sm text-slate-600">
          Start from an inspection on your carrier’s Inspections tab.
        </p>
      )}
    </div>
  )
}
