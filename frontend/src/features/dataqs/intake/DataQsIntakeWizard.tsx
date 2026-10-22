import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useCreateDataQsCase, useDataQsCasePath, useDataQsCheck } from '../../../hooks/useDataQs'
import type { DataQsCheck, DataQsIssueInput } from '../../../types/dataqs'
import { DataQsEventSummary } from '../DataQsEventSummary'
import { unitLabel } from '../labels'
import {
  EMPTY_PRIOR,
  emptyIssue,
  issueComplete,
  issueKey,
  type IssueDraft,
  type Selection,
} from './intakeState'
import { StepExplain } from './StepExplain'
import { StepPriorActivity } from './StepPriorActivity'
import { StepViolations } from './StepViolations'

const STEPS = [
  'The record',
  'What’s wrong',
  'Explain',
  'Source & earlier activity',
  'Review',
] as const

const button =
  'rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-cta text-cta-ink ring-cta hover:bg-cta-hover active:bg-cta-active`
const secondary = `${button} bg-surface text-slate-900 ring-slate-300 hover:bg-slate-50`

/**
 * DataQs intake, steps 1-5 (docs/DataQ.md, Phase 2): the record and its review window, what is
 * wrong, the reason and explanation for each, and earlier activity. Creating it opens a draft case,
 * where the carrier uploads evidence, signs the authorization and submits it to STS.
 */
export function DataQsIntakeWizard({
  usdotNumber,
  inspectionId,
}: {
  usdotNumber: number
  inspectionId: string
}) {
  const check = useDataQsCheck(usdotNumber, inspectionId)
  if (check.isPending) return <p className="text-sm text-slate-500">Loading the inspection…</p>
  if (check.error) {
    return (
      <p className="text-sm text-red-700">Could not load the inspection: {check.error.message}</p>
    )
  }
  return <Wizard check={check.data} />
}

function Wizard({ check }: { check: DataQsCheck }) {
  const [step, setStep] = useState(0)
  const [selection, setSelection] = useState<Selection>([])
  const [issues, setIssues] = useState<Record<string, IssueDraft>>({})
  const [prior, setPrior] = useState(EMPTY_PRIOR)
  const [viewedIn, setViewedIn] = useState('A&I/SMS Results')
  // One key for this intake: pressing "Create" twice returns the same case.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const create = useCreateDataQsCase(check.usdot_number)
  const casePath = useDataQsCasePath()
  const navigate = useNavigate()

  const choose = (next: Selection) => {
    setSelection(next)
    setIssues((current) => {
      const kept: Record<string, IssueDraft> = {}
      for (const index of next) kept[issueKey(index)] = current[issueKey(index)] ?? emptyIssue()
      return kept
    })
  }

  const canContinue = [
    check.can_open,
    selection.length > 0,
    selection.every((index) => issueComplete(issues[issueKey(index)])),
    true,
    true,
  ][step]

  const submit = () => {
    const payload: DataQsIssueInput[] = selection.map((index) => {
      const issue = issues[issueKey(index)]
      return {
        violation_index: index,
        reason: issue.reason as DataQsIssueInput['reason'],
        recorded_value: issue.recorded_value.trim() || null,
        requested_value: issue.requested_value.trim() || null,
        factual_basis: issue.factual_basis.trim(),
      }
    })
    create.mutate(
      {
        input: {
          inspection_id: check.event.inspection_id,
          issues: payload,
          prior_activity: prior,
          viewed_in: viewedIn.trim() || null,
        },
        key: idempotencyKey,
      },
      { onSuccess: (created) => navigate(casePath(created.id)) },
    )
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`rounded-full px-3 py-1 ${
              i === step
                ? 'bg-accent-soft font-medium text-accent-strong'
                : i < step
                  ? 'bg-slate-100 text-slate-700'
                  : 'text-slate-500 ring-1 ring-inset ring-slate-200'
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5">
        {step === 0 && <StepRecord check={check} />}
        {step === 1 && (
          <StepViolations
            violations={check.event.violations}
            selection={selection}
            onChange={choose}
          />
        )}
        {step === 2 && (
          <StepExplain
            selection={selection}
            violations={check.event.violations}
            reasons={check.reasons}
            issues={issues}
            onChange={(key, next) => setIssues((current) => ({ ...current, [key]: next }))}
          />
        )}
        {step === 3 && (
          <StepPriorActivity
            value={prior}
            onChange={setPrior}
            viewedIn={viewedIn}
            onViewedIn={setViewedIn}
          />
        )}
        {step === 4 && <StepReview check={check} selection={selection} issues={issues} />}
      </section>

      {create.isError && (
        <p className="text-sm text-red-700" role="alert">
          Could not open the case: {create.error.message}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <button
          type="button"
          className={secondary}
          disabled={step === 0 || create.isPending}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className={primary}
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
          </button>
        ) : (
          <button type="button" className={primary} disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Opening…' : 'Open draft case and add evidence'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Step 1: the record, its review window, and whether a case can be opened. */
function StepRecord({ check }: { check: DataQsCheck }) {
  const casePath = useDataQsCasePath()
  return (
    <div className="space-y-4">
      <DataQsEventSummary
        event={check.event}
        eligibility={check.eligibility}
        carrierName={check.carrier_name}
        usdotNumber={check.usdot_number}
      />
      {check.existing_cases.length > 0 && (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          Your company already has an open case on this inspection:{' '}
          {check.existing_cases.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <Link to={casePath(c.id)} className="font-medium text-accent-strong hover:underline">
                case {c.id}
              </Link>
            </span>
          ))}
          . Start a new one only for different violations.
        </div>
      )}
      {!check.can_open && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          {check.cannot_open_reason}
        </p>
      )}
    </div>
  )
}

/** Step 5 review: what the draft case will hold. */
function StepReview({
  check,
  selection,
  issues,
}: {
  check: DataQsCheck
  selection: Selection
  issues: Record<string, IssueDraft>
}) {
  const label = (reason: string) => check.reasons.find((r) => r.reason === reason)?.label
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        This opens a <span className="font-medium">draft case</span> for inspection{' '}
        <span className="font-mono text-xs">{check.event.inspection_id}</span>. Next you’ll upload
        evidence, sign the authorization and submit it to STS. Nothing is filed with FMCSA until you
        approve the exact request later.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {selection.map((index) => {
          const issue = issues[issueKey(index)]
          const v = index === null ? null : check.event.violations.find((x) => x.index === index)
          return (
            <li key={issueKey(index)} className="p-3">
              <div className="font-medium text-slate-900">
                {v
                  ? `${v.description ?? 'Violation'} (${v.code}, ${unitLabel(v.applies_to, v.unit_number)})`
                  : 'The whole inspection'}
              </div>
              <div className="text-xs text-slate-600">{label(issue.reason)}</div>
              <p className="mt-1 whitespace-pre-line text-slate-700">{issue.factual_basis}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
