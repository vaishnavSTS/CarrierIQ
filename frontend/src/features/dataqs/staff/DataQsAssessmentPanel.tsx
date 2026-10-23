import { useState, type FormEvent } from 'react'

import { useAssessDataQsCase } from '../../../hooks/useDataQs'
import type {
  CheckResult,
  DataQsAssessmentOutcome,
  DataQsCase,
  DataQsCheckAnswer,
} from '../../../types/dataqs'
import { inputClass, labelClass } from '../intake/intakeState'
import { primaryButton } from '../ui'
import { DataQsAssessmentBrief } from './DataQsAssessmentBrief'

const OUTCOMES: { value: DataQsAssessmentOutcome; label: string; hint: string }[] = [
  { value: 'READY_TO_PREPARE', label: 'Ready to prepare', hint: 'Build the filing package next.' },
  {
    value: 'EVIDENCE_NEEDED',
    label: 'Evidence needed',
    hint: 'Back to the carrier; say exactly what is missing.',
  },
  {
    value: 'PENDING_EXTERNAL',
    label: 'Pending external event',
    hint: 'e.g. a court date; reassess when it happens.',
  },
  { value: 'SPECIALIST_REVIEW', label: 'Specialist review', hint: 'A more experienced reviewer.' },
  {
    value: 'INSUFFICIENT_BASIS',
    label: 'Insufficient basis',
    hint: 'STS won’t file it; the case closes. Tell the carrier why.',
  },
]
const RESULTS: { value: CheckResult; label: string }[] = [
  { value: 'PASS', label: 'Pass' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'NA', label: 'N/A' },
]
const NEEDS_MESSAGE: DataQsAssessmentOutcome[] = ['EVIDENCE_NEEDED', 'INSUFFICIENT_BASIS']

/** STS: answer every check, then choose the outcome. The carrier sees only the message. */
export function DataQsAssessmentPanel({ dataqsCase }: { dataqsCase: DataQsCase }) {
  const [checks, setChecks] = useState<Record<string, DataQsCheckAnswer>>({})
  const [outcome, setOutcome] = useState<DataQsAssessmentOutcome | ''>('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const assess = useAssessDataQsCase(dataqsCase.id)

  const answered = dataqsCase.assessment_checks.every((c) => checks[c.key])
  const failed = dataqsCase.assessment_checks.filter((c) => checks[c.key]?.result === 'ISSUE')
  const readyBlocked = outcome === 'READY_TO_PREPARE' && failed.length > 0
  const messageMissing = outcome !== '' && NEEDS_MESSAGE.includes(outcome) && !message.trim()
  const setCheck = (key: string, patch: Partial<DataQsCheckAnswer>) =>
    setChecks((current) => ({
      ...current,
      [key]: {
        result: patch.result ?? current[key]?.result ?? 'PASS',
        note: patch.note !== undefined ? patch.note : (current[key]?.note ?? null),
      },
    }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (outcome === '') return
    assess.mutate(
      {
        expected_version: dataqsCase.row_version,
        outcome,
        checks,
        carrier_message: message.trim() || null,
        internal_note: note.trim() || null,
      },
      {
        onSuccess: () => {
          setChecks({})
          setOutcome('')
          setMessage('')
          setNote('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <DataQsAssessmentBrief dataqsCase={dataqsCase} />
      <table className="w-full">
        <tbody className="divide-y divide-slate-100">
          {dataqsCase.assessment_checks.map((check) => (
            <tr key={check.key} className="align-top">
              <td className="py-2 pr-3">
                <div className="font-medium text-slate-900">{check.label}</div>
                <div className="text-xs text-slate-600">{check.hint}</div>
              </td>
              <td className="whitespace-nowrap py-2 pr-3">
                {RESULTS.map((r) => (
                  <label key={r.value} className="mr-3 inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`check-${check.key}`}
                      aria-label={`${check.label}: ${r.label}`}
                      checked={checks[check.key]?.result === r.value}
                      onChange={() => setCheck(check.key, { result: r.value })}
                    />
                    {r.label}
                  </label>
                ))}
              </td>
              <td className="w-1/3 py-2">
                <input
                  aria-label={`${check.label} note`}
                  placeholder="Note (optional)"
                  value={checks[check.key]?.note ?? ''}
                  maxLength={2000}
                  disabled={!checks[check.key]}
                  onChange={(e) => setCheck(check.key, { note: e.target.value || null })}
                  className={inputClass}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="outcome" className={labelClass}>
            Outcome
          </label>
          <select
            id="outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as DataQsAssessmentOutcome | '')}
            className={inputClass}
          >
            <option value="">Choose…</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {outcome && (
            <p className="mt-1 text-xs text-slate-600">
              {OUTCOMES.find((o) => o.value === outcome)?.hint}
            </p>
          )}
          {readyBlocked && (
            <p className="mt-1 text-xs text-red-700">
              Failed checks ({failed.map((c) => c.label).join(', ')}) can’t be ready to prepare.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="carrier-message" className={labelClass}>
            Message to the carrier
            {NEEDS_MESSAGE.includes(outcome as DataQsAssessmentOutcome) ? '' : ' (optional)'}
          </label>
          <textarea
            id="carrier-message"
            rows={3}
            value={message}
            maxLength={5000}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="internal-note" className={labelClass}>
          Internal note (STS only)
        </label>
        <textarea
          id="internal-note"
          rows={2}
          value={note}
          maxLength={5000}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </div>
      {assess.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {assess.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={!answered || outcome === '' || readyBlocked || messageMissing || assess.isPending}
      >
        {assess.isPending ? 'Saving…' : 'Record assessment'}
      </button>
    </form>
  )
}
