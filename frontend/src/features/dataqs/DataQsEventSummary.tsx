import { StatusBadge } from '../../components/StatusBadge'
import type { DataQsEvent, Eligibility } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import { levelLabel } from '../carrier-profile/safety/inspectionLevels'
import { ELIGIBILITY } from './labels'

/** The inspection as preserved for the case, and its review window. */
export function DataQsEventSummary({
  event,
  eligibility,
  carrierName,
  usdotNumber,
}: {
  event: DataQsEvent
  eligibility: Eligibility
  carrierName: string | null
  usdotNumber: number
}) {
  const window = ELIGIBILITY[eligibility.status]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Carrier</dt>
        <dd>
          {carrierName ?? '—'}{' '}
          <span className="text-xs text-slate-600">
            USDOT <span className="font-mono">{usdotNumber}</span>
          </span>
        </dd>
        <dt className="text-slate-500">Inspection</dt>
        <dd className="font-mono text-xs leading-5">{event.inspection_id}</dd>
        <dt className="text-slate-500">Date</dt>
        <dd>{formatDate(event.inspection_date)}</dd>
        <dt className="text-slate-500">Where</dt>
        <dd>{[event.location, event.state].filter(Boolean).join(', ') || '—'}</dd>
        <dt className="text-slate-500">Level</dt>
        <dd>{levelLabel(event.level)}</dd>
        <dt className="text-slate-500">Out of service</dt>
        <dd>
          {[event.vehicle_oos && 'Vehicle', event.driver_oos && 'Driver']
            .filter(Boolean)
            .join(', ') || 'No'}
        </dd>
      </dl>
      <div className="space-y-2 text-sm">
        <StatusBadge label={window.label} tone={window.tone} />
        {eligibility.window_ends && (
          <p className="text-slate-700">
            The state review window ({eligibility.window_years} years) ends{' '}
            <span className="font-medium">{formatDate(eligibility.window_ends)}</span>
            {eligibility.days_left !== null &&
              eligibility.days_left >= 0 &&
              ` (${eligibility.days_left} days left)`}
            .
          </p>
        )}
        {eligibility.notes.map((note) => (
          <p key={note} className="text-slate-600">
            {note}
          </p>
        ))}
        <p className="text-xs text-slate-600">
          Timing only: it doesn’t mean the record is wrong. FMCSA data as of{' '}
          {formatDateTime(event.source_observed_at)}.
        </p>
      </div>
    </div>
  )
}
