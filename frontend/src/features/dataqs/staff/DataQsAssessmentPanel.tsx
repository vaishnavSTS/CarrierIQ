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
/** How a chosen answer looks: pass green, issue amber, N/A grey. */
const RESULT_TONE: Record<CheckResult, string> = {
  PASS: 'border-emerald-600 bg-emerald-50 font-medium text-emerald-800',
  ISSUE: 'border-amber-600 bg-amber-50 font-medium text-amber-800',
  NA: 'border-slate-500 bg-slate-100 font-medium text-slate-800',
}
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
      {/* Phones: each check stacked, with full-width choices; wider screens: one row each */}
      <ul className="divide-y divide-slate-100">
        {dataqsCase.assessment_checks.map((check) => (
          <li
            key={check.key}
            className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)] sm:items-start sm:gap-3"
          >
            <div>
              <div className="font-medium text-slate-900">{check.label}</div>
              <div className="text-xs text-slate-600">{check.hint}</div>
            </div>
            <div role="radiogroup" aria-label={check.label} className="flex gap-2">
              {RESULTS.map((r) => {
                const selected = checks[check.key]?.result === r.value
                return (
                  <label
                    key={r.value}
                    className={`relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm focus-within:ring-2 focus-within:ring-accent/40 sm:min-h-0 sm:flex-none sm:py-1.5 ${
                      selected
                        ? RESULT_TONE[r.value]
                        : 'border-slate-300 bg-surface text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`check-${check.key}`}
                      aria-label={`${check.label}: ${r.label}`}
                      checked={selected}
                      onChange={() => setCheck(check.key, { result: r.value })}
                      className="sr-only"
                    />
                    {r.label}
                  </label>
                )
              })}
            </div>
            <input
              aria-label={`${check.label} note`}
              placeholder="Note (optional)"
              value={checks[check.key]?.note ?? ''}
              maxLength={2000}
              disabled={!checks[check.key]}
              onChange={(e) => setCheck(check.key, { note: e.target.value || null })}
              className={inputClass}
            />
          </li>
        ))}
      </ul>

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
