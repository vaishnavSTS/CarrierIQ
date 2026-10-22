import { StatusBadge } from '../../components/StatusBadge'
import type { DataQsCase, DataQsReviewLevel } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'

const LEVEL: Record<DataQsReviewLevel, string> = {
  INITIAL: 'Initial review',
  RECONSIDERATION: 'Reconsideration',
  FINAL: 'Final review',
}
const OUTCOME: Record<string, { label: string; tone: 'ok' | 'warn' | 'down' | 'neutral' }> = {
  FULL_CORRECTION: { label: 'Corrected', tone: 'ok' },
  PARTIAL_CORRECTION: { label: 'Partly corrected', tone: 'warn' },
  NO_CORRECTION: { label: 'Not corrected', tone: 'down' },
  PROCEDURAL_CLOSURE: { label: 'Closed without a decision', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
}
const PROCEDURAL: Record<string, string> = {
  INSUFFICIENT_INFORMATION: 'insufficient information',
  NO_RESPONSE: 'no response to the agency’s request',
}

/** Each review stage, oldest first: earlier stages and their decisions are never overwritten. */
export function DataQsReviewStages({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const issueName = (id: number) => {
    const issue = c.issues.find((i) => i.id === id)
    return issue?.violation_code
      ? `${issue.violation_description ?? 'Violation'} (${issue.violation_code})`
      : 'The whole inspection'
  }
  return (
    <ol className="space-y-4 text-sm">
      {c.review_cycles.map((cycle) => {
        const outcome = cycle.outcome ? OUTCOME[cycle.outcome] : null
        return (
          <li key={cycle.id} className="space-y-1 border-l-2 border-slate-200 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">
                {LEVEL[cycle.level]}
                {cycle.cycle_number > 1 && ` (round ${cycle.cycle_number})`}
              </span>
              {outcome ? (
                <StatusBadge label={outcome.label} tone={outcome.tone} />
              ) : cycle.submitted_at ? (
                <StatusBadge label="Under review" tone="pending" />
              ) : (
                <StatusBadge label="Being prepared" tone="neutral" />
              )}
            </div>
            <p className="text-xs text-slate-600">
              {cycle.opened_reason}
              {cycle.submitted_at && ` · filed ${formatDateTime(cycle.submitted_at)}`}
              {cycle.decision_issued_at && ` · decided ${formatDateTime(cycle.decision_issued_at)}`}
              {cycle.decided_by && ` by ${cycle.decided_by}`}
            </p>
            {cycle.appealed_issue_ids && cycle.level !== 'INITIAL' && (
              <p className="text-slate-700">
                Appealing: {cycle.appealed_issue_ids.map(issueName).join('; ')}
              </p>
            )}
            {cycle.procedural_reason && (
              <p className="text-slate-700">
                Closed for {PROCEDURAL[cycle.procedural_reason]}, not decided on the merits.
              </p>
            )}
            {cycle.reasons && <p className="whitespace-pre-line text-slate-700">{cycle.reasons}</p>}
            {cycle.appeal_instructions && (
              <p className="text-slate-600">
                <span className="font-medium">Appeal instructions: </span>
                {cycle.appeal_instructions}
              </p>
            )}
            {cycle.grounds && (
              <p className="whitespace-pre-line text-slate-600">
                <span className="font-medium">Grounds (STS): </span>
                {cycle.grounds}
              </p>
            )}
            {cycle.independence_concern && (
              <p className="rounded-md bg-amber-50 p-2 text-amber-900">
                {cycle.independence_concern}
              </p>
            )}
            {cycle.level === 'FINAL' && cycle.outcome && cycle.outcome !== 'FULL_CORRECTION' && (
              <p className="text-xs text-slate-600">
                The final review closes the normal DataQs escalation route; FMCSA is not an
                automatic further appeal.
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
