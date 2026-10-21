import { useState, type FormEvent } from 'react'

import { useProposeDataQsReview } from '../../../hooks/useDataQs'
import type { DataQsCase } from '../../../types/dataqs'
import { formatDateTime } from '../../../utils/format'
import { inputClass, labelClass } from '../intake/intakeState'
import { primaryButton } from '../ui'

const NEXT = { INITIAL: 'reconsideration', RECONSIDERATION: 'final review' } as const

/** STS: ask for the next review stage on denied issues. The appeal then needs its own
 * assessment, a new package and the carrier's approval before it is filed. */
export function DataQsAppealPanel({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const filed = c.review_cycles.filter((cycle) => cycle.submitted_at)
  const latest = filed[filed.length - 1]
  const denied = c.issues.filter((i) => i.outcome === 'NO_CORRECTION')
  const deadline = c.clocks.find((clock) => clock.clock_type === 'APPEAL')
  const [chosen, setChosen] = useState<number[]>(() => denied.map((i) => i.id))
  const [grounds, setGrounds] = useState('')
  const propose = useProposeDataQsReview(c.id)
  if (!latest || latest.level === 'FINAL') return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    propose.mutate({ version: c.row_version, grounds: grounds.trim(), issueIds: chosen })
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-slate-700">
        Ask for {NEXT[latest.level]} of the denied issues
        {deadline?.due_at && <> by {formatDateTime(deadline.due_at)}</>}. The grounds must answer
        the decision’s reasons; new evidence may send it back to initial review instead.
      </p>
      <fieldset className="space-y-1">
        <legend className={labelClass}>Issues to appeal</legend>
        {denied.map((issue) => (
          <label key={issue.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(issue.id)}
              onChange={() =>
                setChosen((ids) =>
                  ids.includes(issue.id) ? ids.filter((x) => x !== issue.id) : [...ids, issue.id],
                )
              }
            />
            {issue.violation_code
              ? `${issue.violation_description ?? 'Violation'} (${issue.violation_code})`
              : 'The whole inspection'}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="appeal-grounds" className={labelClass}>
          Grounds (at least 50 characters), addressing the decision
        </label>
        <textarea
          id="appeal-grounds"
          rows={5}
          value={grounds}
          maxLength={20000}
          onChange={(e) => setGrounds(e.target.value)}
          className={inputClass}
        />
      </div>
      {propose.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {propose.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={grounds.trim().length < 50 || chosen.length === 0 || propose.isPending}
      >
        {propose.isPending ? 'Saving…' : `Prepare the ${NEXT[latest.level]} request`}
      </button>
    </form>
  )
}
