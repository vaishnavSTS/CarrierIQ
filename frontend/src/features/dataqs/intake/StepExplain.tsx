import type { DataQsViolation, ReasonOption } from '../../../types/dataqs'
import { unitLabel } from '../labels'
import {
  MIN_BASIS,
  inputClass,
  issueKey,
  labelClass,
  type IssueDraft,
  type Selection,
} from './intakeState'

/** Steps 3 and 4: for each selected item, the reason and what is wrong. */
export function StepExplain({
  selection,
  violations,
  reasons,
  issues,
  onChange,
}: {
  selection: Selection
  violations: DataQsViolation[]
  reasons: ReasonOption[]
  issues: Record<string, IssueDraft>
  onChange: (key: string, next: IssueDraft) => void
}) {
  return (
    <div className="space-y-5">
      {selection.map((index) => {
        const key = issueKey(index)
        const issue = issues[key]
        const violation = index === null ? null : violations.find((v) => v.index === index)
        const reason = reasons.find((r) => r.reason === issue.reason)
        const set = (patch: Partial<IssueDraft>) => onChange(key, { ...issue, ...patch })
        return (
          <section key={key} className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {violation ? (
                <>
                  {violation.description ?? 'Violation'}{' '}
                  <span className="font-mono text-xs font-normal text-slate-500">
                    {violation.code} · {unitLabel(violation.applies_to, violation.unit_number)}
                  </span>
                </>
              ) : (
                'The whole inspection'
              )}
            </h3>

            <div>
              <label htmlFor={`reason-${key}`} className={labelClass}>
                Why is it wrong?
              </label>
              <select
                id={`reason-${key}`}
                value={issue.reason}
                onChange={(e) => set({ reason: e.target.value as IssueDraft['reason'] })}
                className={inputClass}
              >
                <option value="">Choose a reason…</option>
                {reasons
                  .filter((r) => !violation || !r.whole_inspection_only)
                  .map((r) => (
                    <option key={r.reason} value={r.reason}>
                      {r.label}
                    </option>
                  ))}
              </select>
            </div>

            {reason && (
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Evidence that usually helps</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {reason.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-1">You’ll upload files after this, on the case page.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`recorded-${key}`} className={labelClass}>
                  What the record says (optional)
                </label>
                <input
                  id={`recorded-${key}`}
                  value={issue.recorded_value}
                  maxLength={2000}
                  onChange={(e) => set({ recorded_value: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`requested-${key}`} className={labelClass}>
                  What it should say (optional)
                </label>
                <input
                  id={`requested-${key}`}
                  value={issue.requested_value}
                  maxLength={2000}
                  placeholder="e.g. remove the violation"
                  onChange={(e) => set({ requested_value: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor={`basis-${key}`} className={labelClass}>
                What happened, and how do you know? (at least {MIN_BASIS} characters)
              </label>
              <textarea
                id={`basis-${key}`}
                rows={4}
                value={issue.factual_basis}
                maxLength={5000}
                onChange={(e) => set({ factual_basis: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-600">
                Stick to facts you can support with records. A repair made after the inspection
                doesn’t by itself show the problem wasn’t there at the time.
              </p>
            </div>
          </section>
        )
      })}
    </div>
  )
}
