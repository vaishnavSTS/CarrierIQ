import { Link, useParams } from 'react-router-dom'

import { DataQsCaseRoom } from '../features/dataqs/DataQsCaseRoom'
import { usePortalMode } from '../hooks/usePortalMode'

/** One DataQs case: /dataqs/cases/:caseId (STS) and /portal/dataqs/cases/:caseId (clients). */
export function DataQsCasePage() {
  const caseId = Number(useParams().caseId)
  const back = usePortalMode() === 'internal' ? '/dataqs' : '/portal/dataqs'
  return (
    <div className="space-y-4">
      <Link to={back} className="text-sm text-accent-strong hover:underline">
        ← All DataQs cases
      </Link>
      {Number.isInteger(caseId) && caseId > 0 ? (
        <DataQsCaseRoom key={caseId} caseId={caseId} />
      ) : (
        <p className="text-sm text-slate-600">Case not found.</p>
      )}
    </div>
  )
}
