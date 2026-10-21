import { FileSearch } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useMe } from '../../hooks/useAuth'
import { usePortalMode } from '../../hooks/usePortalMode'

/** On an inspection in the client portal: start a DataQs request (account owners only; the
 * server checks the carrier is verified for their company). */
export function RequestDataReviewButton({
  usdotNumber,
  inspectionId,
}: {
  usdotNumber: number
  inspectionId: string
}) {
  const { data: me } = useMe()
  if (usePortalMode() !== 'client' || me?.role !== 'CLIENT_ADMIN') return null
  const params = new URLSearchParams({ usdot: String(usdotNumber), inspection: inspectionId })
  return (
    <Link
      to={`/portal/dataqs/new?${params}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-accent-strong ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
    >
      <FileSearch className="size-3.5" aria-hidden />
      Request data review
    </Link>
  )
}
