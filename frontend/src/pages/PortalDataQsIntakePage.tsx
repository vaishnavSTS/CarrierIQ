import { Link, useSearchParams } from 'react-router-dom'

import { DataQsIntakeWizard } from '../features/dataqs/intake/DataQsIntakeWizard'
import { usePortalMode } from '../hooks/usePortalMode'

/** /portal/dataqs/new?usdot=…&inspection=… (the carrier's owner) and /dataqs/new?… (STS staff, any
 * carrier): start a DataQs request from an inspection. */
export function PortalDataQsIntakePage() {
  const staff = usePortalMode() === 'internal'
  const [params] = useSearchParams()
  const usdot = Number(params.get('usdot'))
  const back = staff ? `/dataqs?view=start&usdot=${params.get('usdot') ?? ''}` : '/portal/dataqs'
  const inspection = params.get('inspection') ?? ''
  const valid = Number.isInteger(usdot) && usdot > 0 && inspection.length > 0

  return (
    <div className="space-y-5">
      <div>
        <Link to={back} className="text-sm text-accent-strong hover:underline">
          ← Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Request a data review</h1>
        <p className="mt-1 text-sm text-slate-600">
          {staff
            ? 'Record what is wrong with this inspection for the carrier. This opens a draft case; the carrier’s account owner adds evidence, signs the authorization and submits it. Nothing is sent to FMCSA until they approve the exact request.'
            : 'Tell STS what is wrong with this inspection. Your answers open a draft case; nothing is sent to FMCSA until you approve the exact request.'}
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
          Start from an inspection on the DataQs {staff ? '“Start a request” tab' : 'tab'}.
        </p>
      )}
    </div>
  )
}
