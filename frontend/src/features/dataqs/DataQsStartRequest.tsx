import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useMe, usePortalOverview } from '../../hooks/useAuth'
import { useDataQsCases } from '../../hooks/useDataQs'
import type { InspectionDetail } from '../../types/carrierSafety'
import { InspectionHistory } from '../carrier-profile/safety/InspectionHistory'
import { DataQsMissingInspection } from './DataQsMissingInspection'
import { inputClass, labelClass } from './intake/intakeState'
import { RequestDataReviewButton } from './RequestDataReviewButton'

/**
 * Client portal DataQs: pick one of the company's STS-verified carriers and start a request from
 * any of its inspections. An inspection that already has an open case links to it.
 */
export function DataQsStartRequest() {
  const { data: me } = useMe()
  const overview = usePortalOverview()
  const cases = useDataQsCases()
  const verified = overview.data?.carriers.filter((c) => c.verified) ?? []
  const waiting = overview.data?.carriers.filter((c) => !c.verified) ?? []
  const [chosen, setChosen] = useState<number | null>(null)
  const usdot = chosen ?? verified[0]?.usdot_number ?? null

  if (overview.isPending) return <p className="text-sm text-slate-500">Loading your carriers…</p>
  if (overview.error) {
    return (
      <p className="text-sm text-red-700">Could not load your carriers: {overview.error.message}</p>
    )
  }

  const openCases = (inspection: InspectionDetail) =>
    (cases.data?.cases ?? []).filter(
      (c) =>
        c.usdot_number === usdot &&
        c.source_event_id === inspection.inspection_id &&
        c.work_status !== 'CLOSED',
    )

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Start a request</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Find the inspection you believe is wrong and choose{' '}
          <span className="font-medium">Request data review</span>. Click a row to see its
          violations first.
          {me?.role !== 'CLIENT_ADMIN' && ' Only your company’s account owner can start a request.'}
        </p>
      </div>

      {waiting.length > 0 && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          STS hasn’t verified{' '}
          {waiting.map((c) => c.legal_name ?? `USDOT ${c.usdot_number}`).join(', ')} for your
          company yet. You can request reviews for a carrier once STS has verified it.
        </p>
      )}

      {verified.length === 0 ? (
        <p className="text-sm text-slate-600">
          No verified carriers yet. Contact STS to verify your USDOT number.
        </p>
      ) : (
        <>
          {verified.length > 1 && (
            <div className="max-w-md">
              <label htmlFor="dataqs-carrier" className={labelClass}>
                Carrier
              </label>
              <select
                id="dataqs-carrier"
                value={usdot ?? ''}
                onChange={(e) => setChosen(Number(e.target.value))}
                className={inputClass}
              >
                {verified.map((c) => (
                  <option key={c.usdot_number} value={c.usdot_number}>
                    {c.legal_name ?? 'Carrier'} · USDOT {c.usdot_number}
                  </option>
                ))}
              </select>
            </div>
          )}
          {usdot !== null && (
            <InspectionHistory
              key={usdot}
              usdotNumber={usdot}
              rowAction={(inspection) => {
                const existing = openCases(inspection)
                return (
                  <div className="flex flex-col items-end gap-1">
                    {existing.map((c) => (
                      <Link
                        key={c.id}
                        to={`/portal/dataqs/cases/${c.id}`}
                        className="whitespace-nowrap py-2.5 sm:py-0 text-xs font-medium text-accent-strong hover:underline"
                      >
                        Open case {c.id}
                      </Link>
                    ))}
                    <RequestDataReviewButton
                      usdotNumber={usdot}
                      inspectionId={inspection.inspection_id}
                    />
                  </div>
                )
              }}
            />
          )}
          {usdot !== null && (
            <DataQsMissingInspection key={`missing-${usdot}`} usdotNumber={usdot} />
          )}
        </>
      )}
    </section>
  )
}
