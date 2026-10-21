import { useState, type FormEvent } from 'react'

import { useRecordDataQsCorrespondence } from '../../../hooks/useDataQs'
import type { DataQsCase, DataQsCorrespondenceInput } from '../../../types/dataqs'
import { inputClass, labelClass } from '../intake/intakeState'
import { DATAQS_STATUSES, primaryButton } from '../ui'

type Kind = DataQsCorrespondenceInput['kind']
type IssueOutcome = 'CORRECTED' | 'NOT_CORRECTED'

const KINDS: { value: Kind; label: string; hint: string }[] = [
  {
    value: 'OPENED',
    label: 'Agency opened the request',
    hint: 'DataQs history shows "Opened" (usually within 7 days); clears the 7-day check.',
  },
  {
    value: 'INFO_REQUEST',
    label: 'Agency asked for information',
    hint: 'Pauses the agency’s review clock; you have 14 days to answer.',
  },
  {
    value: 'INFO_RESPONSE',
    label: 'STS answered the agency',
    hint: 'Resumes the agency’s review clock with the time that was left.',
  },
  { value: 'DECISION', label: 'Agency decision', hint: 'Record the outcome for each issue.' },
  {
    value: 'REOPENING',
    label: 'Agency reopened the request',
    hint: 'Starts a new review round; earlier rounds are kept.',
  },
  { value: 'OTHER', label: 'Other agency message', hint: 'Kept on record; changes nothing.' },
]

function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/** STS: record a verified agency event from DataQs. Only these move the case's stage and clocks;
 * an uploaded file never does. Use the date the agency issued it, not today. */
export function DataQsCorrespondencePanel({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const filed = c.review_cycles.filter((cycle) => cycle.submitted_at)
  const current = filed[filed.length - 1]
  const asked = c.clocks.some((clock) => clock.clock_type === 'REQUESTER_INFO')
  const decided = !!current?.decision_issued_at
  const preparingAppeal = c.review_cycles.some((cycle) => !cycle.submitted_at)
  const allowed = KINDS.filter((k) => {
    if (k.value === 'OPENED') return c.work_status === 'MONITORING' && !decided
    if (k.value === 'INFO_REQUEST') return c.work_status === 'MONITORING' && !decided && !asked
    if (k.value === 'INFO_RESPONSE') return asked
    if (k.value === 'DECISION') return !decided
    if (k.value === 'REOPENING') return decided && !preparingAppeal
    return true
  })
  const covered = c.issues.filter(
    (i) => !current?.appealed_issue_ids || current.appealed_issue_ids.includes(i.id),
  )

  const [kind, setKind] = useState<Kind>(allowed[0]?.value ?? 'OTHER')
  const [text, setText] = useState('')
  const [occurredAt, setOccurredAt] = useState(localNow)
  const [source, setSource] = useState<DataQsCorrespondenceInput['source']>('DATAQS_PORTAL')
  const [portalStatus, setPortalStatus] = useState('')
  const [agency, setAgency] = useState('')
  const [outcomes, setOutcomes] = useState<Record<number, IssueOutcome>>({})
  const [procedural, setProcedural] = useState<'' | 'INSUFFICIENT_INFORMATION' | 'NO_RESPONSE'>('')
  const [decidedBy, setDecidedBy] = useState('')
  const [reasons, setReasons] = useState('')
  const [instructions, setInstructions] = useState('')
  const [mode, setMode] = useState<'SAME_LEVEL' | 'RETURN_TO_INITIAL'>('SAME_LEVEL')
  const [reopenReason, setReopenReason] = useState('')
  const record = useRecordDataQsCorrespondence(c.id)

  const openedReady = kind !== 'OPENED' || agency.trim().length > 0
  const decisionReady =
    kind !== 'DECISION' || procedural !== '' || covered.every((i) => outcomes[i.id])
  const reopenReady = kind !== 'REOPENING' || reopenReason.trim().length >= 5

  const submit = (event: FormEvent) => {
    event.preventDefault()
    record.mutate(
      {
        expected_version: c.row_version,
        kind,
        source,
        text: text.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        external_id: null,
        portal_status: portalStatus.trim() || null,
        assigned_agency: kind === 'OPENED' ? agency.trim() || null : null,
        decision:
          kind === 'DECISION'
            ? {
                issue_outcomes: procedural ? {} : outcomes,
                procedural_reason: procedural || null,
                decided_by: decidedBy.trim() || null,
                reasons: reasons.trim() || null,
                appeal_instructions: instructions.trim() || null,
              }
            : null,
        reopening: kind === 'REOPENING' ? { mode, reason: reopenReason.trim() } : null,
      },
      {
        onSuccess: () => {
          setText('')
          setOutcomes({})
          setProcedural('')
          setReasons('')
          setInstructions('')
          setReopenReason('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="event-kind" className={labelClass}>
            What happened
          </label>
          <select
            id="event-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className={inputClass}
          >
            {allowed.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{KINDS.find((k) => k.value === kind)?.hint}</p>
        </div>
        <div>
          <label htmlFor="event-at" className={labelClass}>
            {kind === 'INFO_RESPONSE'
              ? 'When STS submitted the answer'
              : 'Date the agency issued it'}
          </label>
          <input
            id="event-at"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="event-source" className={labelClass}>
            Seen in
          </label>
          <select
            id="event-source"
            value={source}
            onChange={(e) => setSource(e.target.value as DataQsCorrespondenceInput['source'])}
            className={inputClass}
          >
            <option value="DATAQS_PORTAL">DataQs portal</option>
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="event-text" className={labelClass}>
          {kind === 'INFO_RESPONSE' ? 'What STS sent' : 'The agency’s text, exactly as written'}
        </label>
        <textarea
          id="event-text"
          rows={4}
          value={text}
          maxLength={20000}
          onChange={(e) => setText(e.target.value)}
          className={inputClass}
        />
      </div>

      {kind === 'OPENED' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="opened-agency" className={labelClass}>
              Assigned agency (as DataQs shows it)
            </label>
            <input
              id="opened-agency"
              value={agency}
              maxLength={200}
              placeholder="e.g. NE SP"
              onChange={(e) => setAgency(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="opened-status" className={labelClass}>
              Status shown in DataQs
            </label>
            <input
              id="opened-status"
              list="dataqs-statuses-event"
              value={portalStatus}
              maxLength={100}
              placeholder="Open - In Review"
              onChange={(e) => setPortalStatus(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {kind === 'DECISION' && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={procedural !== ''}
              onChange={(e) => setProcedural(e.target.checked ? 'INSUFFICIENT_INFORMATION' : '')}
            />
            Closed without a decision on the merits
          </label>
          {procedural !== '' ? (
            <select
              aria-label="Procedural reason"
              value={procedural}
              onChange={(e) => setProcedural(e.target.value as typeof procedural)}
              className={inputClass}
            >
              <option value="INSUFFICIENT_INFORMATION">Insufficient information</option>
              <option value="NO_RESPONSE">No response to the agency’s request</option>
            </select>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {covered.map((issue) => (
                  <tr key={issue.id}>
                    <td className="py-1.5 pr-3">
                      {issue.violation_code
                        ? `${issue.violation_description ?? 'Violation'} (${issue.violation_code})`
                        : 'The whole inspection'}
                    </td>
                    {(['CORRECTED', 'NOT_CORRECTED'] as const).map((value) => (
                      <td key={value} className="whitespace-nowrap py-1.5 pr-3">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`outcome-${issue.id}`}
                            aria-label={`${issue.violation_code ?? 'Inspection'}: ${value === 'CORRECTED' ? 'corrected' : 'not corrected'}`}
                            checked={outcomes[issue.id] === value}
                            onChange={() => setOutcomes((o) => ({ ...o, [issue.id]: value }))}
                          />
                          {value === 'CORRECTED' ? 'Corrected' : 'Not corrected'}
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="decided-by" className={labelClass}>
                Decided by (reviewer)
              </label>
              <input
                id="decided-by"
                value={decidedBy}
                maxLength={200}
                onChange={(e) => setDecidedBy(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="portal-status-event" className={labelClass}>
                Status shown in DataQs
              </label>
              <input
                id="portal-status-event"
                list="dataqs-statuses-event"
                value={portalStatus}
                maxLength={100}
                onChange={(e) => setPortalStatus(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="decision-reasons" className={labelClass}>
              Reasons given
            </label>
            <textarea
              id="decision-reasons"
              rows={3}
              value={reasons}
              maxLength={10000}
              onChange={(e) => setReasons(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="appeal-instructions" className={labelClass}>
              Appeal instructions (if any)
            </label>
            <input
              id="appeal-instructions"
              value={instructions}
              maxLength={5000}
              onChange={(e) => setInstructions(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {kind === 'REOPENING' && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="reopen-mode"
              checked={mode === 'SAME_LEVEL'}
              onChange={() => setMode('SAME_LEVEL')}
            />
            Reopened at the same level (requested information supplied after closure)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="reopen-mode"
              checked={mode === 'RETURN_TO_INITIAL'}
              onChange={() => setMode('RETURN_TO_INITIAL')}
            />
            Returned to initial review (new evidence at appeal)
          </label>
          <input
            aria-label="Reason"
            placeholder="What the agency said"
            value={reopenReason}
            maxLength={1000}
            onChange={(e) => setReopenReason(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <datalist id="dataqs-statuses-event">
        {DATAQS_STATUSES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {record.isError && (
        <p className="text-red-700" role="alert">
          Could not record it: {record.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={
          text.trim().length < 3 ||
          !openedReady ||
          !decisionReady ||
          !reopenReady ||
          record.isPending
        }
      >
        {record.isPending ? 'Saving…' : 'Record'}
      </button>
    </form>
  )
}
