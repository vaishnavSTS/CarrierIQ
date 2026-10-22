import type { DataQsPriorActivity } from '../../../types/dataqs'
import { inputClass, labelClass } from './intakeState'

/** Step 4: where the carrier saw the record (DataQs asks), and anything already filed or
 * decided about this inspection. */
export function StepPriorActivity({
  value,
  onChange,
  viewedIn,
  onViewedIn,
}: {
  value: DataQsPriorActivity
  onChange: (next: DataQsPriorActivity) => void
  viewedIn: string
  onViewedIn: (next: string) => void
}) {
  const set = (patch: Partial<DataQsPriorActivity>) => onChange({ ...value, ...patch })
  const text = (v: string) => v || null
  return (
    <div className="space-y-4 text-sm">
      <div className="max-w-md">
        <label htmlFor="viewed-in" className={labelClass}>
          Where did you see this record?
        </label>
        <input
          id="viewed-in"
          list="viewed-in-options"
          value={viewedIn}
          maxLength={100}
          placeholder="e.g. A&I/SMS Results"
          onChange={(e) => onViewedIn(e.target.value)}
          className={inputClass}
        />
        <datalist id="viewed-in-options">
          <option value="A&I/SMS Results" />
          <option value="Pre-Employment Screening Program (PSP) report" />
          <option value="FMCSA Portal" />
          <option value="Roadside inspection report" />
          <option value="CarrierSafetyScan" />
        </datalist>
        <p className="mt-1 text-xs text-slate-600">DataQs asks this when the request is filed.</p>
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.has_prior_request}
          onChange={(e) => set({ has_prior_request: e.target.checked })}
        />
        <span>A DataQs request about this inspection was filed before (by us or someone else)</span>
      </label>
      {value.has_prior_request && (
        <div className="grid gap-3 pl-6 sm:grid-cols-2">
          <div>
            <label htmlFor="prior-id" className={labelClass}>
              DataQs request ID, if you have it
            </label>
            <input
              id="prior-id"
              value={value.prior_request_id ?? ''}
              maxLength={50}
              onChange={(e) => set({ prior_request_id: text(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="prior-rep" className={labelClass}>
              Who filed it
            </label>
            <input
              id="prior-rep"
              value={value.prior_representative ?? ''}
              maxLength={200}
              onChange={(e) => set({ prior_representative: text(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="prior-decision" className={labelClass}>
              What was decided
            </label>
            <textarea
              id="prior-decision"
              rows={2}
              value={value.prior_decision ?? ''}
              maxLength={2000}
              onChange={(e) => set({ prior_decision: text(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>
      )}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.pending_court}
          onChange={(e) => set({ pending_court: e.target.checked })}
        />
        <span>A citation from this inspection is still pending in court</span>
      </label>
      <div>
        <label htmlFor="prior-notes" className={labelClass}>
          Anything else STS should know (optional)
        </label>
        <textarea
          id="prior-notes"
          rows={3}
          value={value.notes ?? ''}
          maxLength={2000}
          onChange={(e) => set({ notes: text(e.target.value) })}
          className={inputClass}
        />
      </div>
    </div>
  )
}
