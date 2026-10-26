import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../../../api/client'
import { useCarrierProfile } from '../../../hooks/useCarrierProfile'
import { useDataQsCases } from '../../../hooks/useDataQs'
import type { InspectionDetail } from '../../../types/carrierSafety'
import { InspectionHistory } from '../../carrier-profile/safety/InspectionHistory'
import { inputClass, labelClass } from '../intake/intakeState'
import { RequestDataReviewButton } from '../RequestDataReviewButton'
import { primaryButton } from '../ui'

/**
 * STS staff: find any carrier by USDOT number and start a DataQs request from one of its
 * inspections, the same way the carrier's owner does. The draft belongs to the client company STS
 * verified the carrier for, or STS holds it until there is one.
 */
export function DataQsStaffStartRequest({
  usdotNumber,
  onSearch,
}: {
  usdotNumber: number | null
  onSearch: (usdot: number | null) => void
}) {
  const [typed, setTyped] = useState(usdotNumber ? String(usdotNumber) : '')
  const [invalid, setInvalid] = useState(false)

  const find = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(typed.trim())
    const valid = /^\d{1,8}$/.test(typed.trim()) && value > 0
    setInvalid(!valid)
    if (valid) onSearch(value)
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Start a request for a carrier</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Search a USDOT number, find the inspection and choose{' '}
          <span className="font-medium">Request data review</span>. The carrier’s account owner
          signs the authorization and submits the draft.
        </p>
      </div>
      <form onSubmit={find} className="flex flex-wrap items-end gap-2" role="search">
        <div className="w-full max-w-xs">
          <label htmlFor="dataqs-staff-usdot" className={labelClass}>
            USDOT number
          </label>
          <input
            id="dataqs-staff-usdot"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="e.g. 3794204"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'dataqs-staff-usdot-error' : undefined}
            className={inputClass}
          />
        </div>
        <button type="submit" className={primaryButton}>
          Find carrier
        </button>
      </form>
      {invalid && (
        <p id="dataqs-staff-usdot-error" className="text-sm text-red-700" role="alert">
          Enter a USDOT number (digits only).
        </p>
      )}
      {usdotNumber !== null && <CarrierInspections key={usdotNumber} usdotNumber={usdotNumber} />}
    </section>
  )
}

function CarrierInspections({ usdotNumber }: { usdotNumber: number }) {
  const profile = useCarrierProfile(usdotNumber)
  const cases = useDataQsCases()

  if (profile.isPending) {
    return (
      <p className="text-sm text-slate-500">
        Loading USDOT {usdotNumber}… a carrier not stored yet is loaded from FMCSA, which can take a
        moment.
      </p>
    )
  }
  if (profile.error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        {profile.error instanceof ApiError && profile.error.status === 404
          ? `No carrier found with USDOT ${usdotNumber}.`
          : `Could not load USDOT ${usdotNumber}: ${profile.error.message}`}
      </p>
    )
  }

  const openCases = (inspection: InspectionDetail) =>
    (cases.data?.cases ?? []).filter(
      (c) =>
        c.usdot_number === usdotNumber &&
        c.source_event_id === inspection.inspection_id &&
        c.work_status !== 'CLOSED',
    )

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        <Link
          to={`/carriers/${usdotNumber}`}
          className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
        >
          {profile.data.legal_name}
        </Link>{' '}
        · USDOT <span className="font-mono">{usdotNumber}</span>
      </p>
      <InspectionHistory
        usdotNumber={usdotNumber}
        rowAction={(inspection) => (
          <div className="flex flex-col items-end gap-1">
            {openCases(inspection).map((c) => (
              <Link
                key={c.id}
                to={`/dataqs/cases/${c.id}`}
                className="whitespace-nowrap py-2.5 text-xs font-medium text-accent-strong hover:underline sm:py-0"
              >
                Open case {c.id}
              </Link>
            ))}
            <RequestDataReviewButton
              usdotNumber={usdotNumber}
              inspectionId={inspection.inspection_id}
            />
          </div>
        )}
      />
    </div>
  )
}
