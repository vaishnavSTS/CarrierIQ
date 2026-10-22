import { CheckCircle2, Circle } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import { useCheckDataQsCorrection, useConfirmDataQsCorrection } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase, DataQsIssue, DataQsVerificationStatus } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import type { Tone } from '../../utils/status'
import { inputClass, labelClass } from './intake/intakeState'
import { secondaryButton } from './ui'

const STATUS: Record<DataQsVerificationStatus, { label: string; tone: Tone }> = {
  WAITING: { label: 'Waiting for FMCSA', tone: 'pending' },
  VERIFIED: { label: 'Verified', tone: 'ok' },
  REVIEW: { label: 'Awaiting STS verification', tone: 'warn' },
  MANUAL: { label: 'Awaiting STS verification', tone: 'warn' },
}

/** Phase 6: does FMCSA's data show each correction the agency approved? Four steps per issue:
 * requested, approved, FMCSA's record changed, shown in CarrierSafetyScan. Shared by both
 * portals; STS can check now and confirm a correction by hand. */
export function DataQsVerification({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const corrected = c.issues.filter((i) => i.verification_status !== null)
  const filedAt = c.attempts.find((a) => a.status === 'CONFIRMED')?.filed_at ?? null
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-700">
        An approval counts as a correction only once FMCSA’s own record shows it. STS checks FMCSA’s
        inspection file every day. FMCSA recalculates CSA (SMS) scores in its monthly update, so
        scores can take up to a month to follow.
      </p>
      <p className="text-xs text-slate-500">
        Last checked FMCSA:{' '}
        {c.verification_checked_at ? formatDateTime(c.verification_checked_at) : 'not yet'}
      </p>
      {staff && c.verification_error && (
        <p className="text-red-700" role="alert">
          The last check failed: {c.verification_error}. It is tried again within the hour.
        </p>
      )}
      {staff && c.can_verify && <CheckNow caseId={c.id} />}

      <div className="space-y-3">
        {corrected.map((issue) => (
          <IssueProgress key={issue.id} dataqsCase={c} issue={issue} filedAt={filedAt} />
        ))}
      </div>

      {c.verification_checks.length > 0 && (
        <details>
          <summary className="cursor-pointer text-slate-600">
            What FMCSA’s record showed ({c.verification_checks.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {c.verification_checks.map((check) => (
              <li key={check.at} className="flex gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-500">
                  {formatDateTime(check.at)}
                </span>
                <span className="text-slate-700">
                  {check.changes.length === 0
                    ? 'The same as when the request was opened'
                    : check.changes.join('; ')}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function CheckNow({ caseId }: { caseId: number }) {
  const check = useCheckDataQsCorrection(caseId)
  return (
    <div>
      <button
        type="button"
        className={secondaryButton}
        disabled={check.isPending}
        onClick={() => check.mutate(undefined)}
      >
        {check.isPending ? 'Checking FMCSA…' : 'Check FMCSA now'}
      </button>
      {check.isError && (
        <p className="mt-1 text-red-700" role="alert">
          Could not check: {check.error.message}
        </p>
      )}
    </div>
  )
}

function Step({ done, title, children }: { done: boolean; title: string; children: ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle
  return (
    <li className="flex gap-2">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${done ? 'text-emerald-600' : 'text-slate-300'}`}
        aria-hidden
      />
      <div>
        <div className={done ? 'font-medium text-slate-900' : 'text-slate-600'}>{title}</div>
        <div className="text-xs text-slate-500">{children}</div>
      </div>
    </li>
  )
}

function IssueProgress({
  dataqsCase: c,
  issue,
  filedAt,
}: {
  dataqsCase: DataQsCase
  issue: DataQsIssue
  filedAt: string | null
}) {
  const staff = usePortalMode() === 'internal'
  const status = issue.verification_status ?? 'WAITING'
  const verified = status === 'VERIFIED'
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">
          {issue.violation_code
            ? `${issue.violation_description ?? 'Violation'} (${issue.violation_code})`
            : 'The whole inspection'}
        </span>
        <StatusBadge {...STATUS[status]} />
      </div>
      <ol className="space-y-2">
        <Step done={filedAt !== null} title="Requested">
          {filedAt ? `Filed with DataQs ${formatDate(filedAt.slice(0, 10))}` : 'Not filed yet'}
        </Step>
        <Step done={issue.decided_at !== null} title="Agency approved the correction">
          {issue.decided_at ? formatDate(issue.decided_at.slice(0, 10)) : '—'}
        </Step>
        <Step done={verified} title="FMCSA’s record changed">
          {verified ? (
            <>
              {issue.verified_at && formatDateTime(issue.verified_at)} ·{' '}
              {issue.verified_by_name
                ? `confirmed by ${issue.verified_by_name}`
                : 'seen by the daily check'}
              {issue.verification_note && <> · {issue.verification_note}</>}
            </>
          ) : status === 'WAITING' ? (
            <>
              Waiting for FMCSA’s records to update
              {c.verification_checked_at &&
                ` (last checked ${formatDateTime(c.verification_checked_at)})`}
              {issue.verification_note && <>. {issue.verification_note}</>}
            </>
          ) : staff ? (
            <>
              Awaiting STS verification{issue.verification_note && <>: {issue.verification_note}</>}
            </>
          ) : (
            // STS's note says what to check: an instruction for STS, not news for the carrier.
            'STS is confirming this correction in FMCSA’s records.'
          )}
        </Step>
        <Step done={issue.shown_at !== null} title="Shown in CarrierSafetyScan">
          {issue.shown_at
            ? formatDateTime(issue.shown_at)
            : verified
              ? 'Updating CarrierSafetyScan’s copy of the inspection'
              : 'After FMCSA’s record changes'}
        </Step>
      </ol>
      {staff && c.can_verify && !verified && <ConfirmByHand caseId={c.id} issueId={issue.id} />}
    </div>
  )
}

function ConfirmByHand({ caseId, issueId }: { caseId: number; issueId: number }) {
  const [note, setNote] = useState('')
  const confirm = useConfirmDataQsCorrection(caseId)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    confirm.mutate({ issueId, note: note.trim() })
  }
  return (
    <details>
      <summary className="cursor-pointer font-medium text-accent-strong">Confirm by hand</summary>
      <form onSubmit={submit} className="mt-2 space-y-2">
        <div>
          <label htmlFor={`verify-note-${issueId}`} className={labelClass}>
            How you know FMCSA’s records show it (kept for STS; the carrier is told it’s confirmed)
          </label>
          <textarea
            id={`verify-note-${issueId}`}
            rows={2}
            value={note}
            maxLength={2000}
            placeholder="e.g. PSP report pulled Oct 22 no longer lists the violation."
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </div>
        {confirm.isError && (
          <p className="text-red-700" role="alert">
            Could not confirm: {confirm.error.message}
          </p>
        )}
        <button
          type="submit"
          className={secondaryButton}
          disabled={note.trim().length < 5 || confirm.isPending}
        >
          {confirm.isPending ? 'Saving…' : 'Confirm the correction'}
        </button>
      </form>
    </details>
  )
}
