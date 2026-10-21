import { StatusBadge } from '../../../components/StatusBadge'
import type { DataQsViolation } from '../../../types/dataqs'
import { unitLabel } from '../labels'
import type { Selection } from './intakeState'

/** Step 2: which violations are wrong, or the inspection as a whole. */
export function StepViolations({
  violations,
  selection,
  onChange,
}: {
  violations: DataQsViolation[]
  selection: Selection
  onChange: (next: Selection) => void
}) {
  const whole = selection.includes(null)
  const toggle = (index: number) =>
    onChange(
      selection.includes(index)
        ? selection.filter((i) => i !== index)
        : [...selection.filter((i) => i !== null), index],
    )

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm text-slate-700">
        Select each violation you believe is wrong. If the whole inspection isn’t yours (for example
        the wrong carrier was named), choose the last option instead.
      </legend>
      {violations.length === 0 && (
        <p className="text-sm text-slate-500">
          FMCSA has no violation details for this inspection.
        </p>
      )}
      {violations.map((v) => (
        <label
          key={v.index}
          className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-surface p-3 text-sm hover:bg-slate-50"
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={selection.includes(v.index)}
            onChange={() => toggle(v.index)}
          />
          <span className="flex-1">
            <span className="text-slate-900">{v.description ?? 'No description'}</span>{' '}
            <span className="font-mono text-xs text-slate-500">{v.code}</span>
            <span className="block text-xs text-slate-500">
              {unitLabel(v.applies_to, v.unit_number)}
              {v.citation_number && ` · Citation ${v.citation_number}`}
            </span>
          </span>
          {v.out_of_service && <StatusBadge label="Out of service" tone="down" />}
        </label>
      ))}
      <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-surface p-3 text-sm hover:bg-slate-50">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={whole}
          onChange={() => onChange(whole ? [] : [null])}
        />
        <span>
          <span className="text-slate-900">The whole inspection</span>
          <span className="block text-xs text-slate-500">
            For example: not our vehicle, driver or company, or a duplicate inspection.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
