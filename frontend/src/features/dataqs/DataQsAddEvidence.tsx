import { useState } from 'react'

import type { DataQsCase } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { DataQsEvidenceUpload } from './DataQsEvidenceUpload'
import { inputClass, labelClass } from './intake/intakeState'

/** Stages where the request package is already prepared: a new file may mean a new version. */
const PACKAGE_READY: DataQsCase['work_status'][] = ['AWAITING_APPROVAL', 'READY_TO_FILE']

/**
 * The carrier's "Add more evidence" step: what STS last asked for, and one upload form with a
 * choice of the issue the file supports. STS is told about new files (one email per batch).
 */
export function DataQsAddEvidence({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [issueId, setIssueId] = useState(c.issues[0]?.id ?? 0)
  const asked = c.assessments[c.assessments.length - 1]?.carrier_message
  const message = c.messages.find((m) => m.kind === 'MESSAGE')
  const issue = c.issues.find((i) => i.id === issueId) ?? c.issues[0]
  if (!issue) return null

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Add more evidence</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          Files you add here go to STS, and STS is emailed about them.
        </p>
      </div>

      {(c.work_status === 'EVIDENCE_NEEDED' && asked) || message ? (
        <div className="rounded-lg border-l-2 border-accent bg-accent-soft px-3 py-2 text-sm">
          {c.work_status === 'EVIDENCE_NEEDED' && asked ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                STS asked
              </div>
              <p className="whitespace-pre-line text-slate-900">{asked}</p>
            </>
          ) : (
            message && (
              <>
                <div className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                  Latest message from STS · {formatDateTime(message.created_at)}
                </div>
                <p className="font-medium text-slate-900">{message.subject}</p>
                <p className="line-clamp-3 whitespace-pre-line text-slate-700">{message.body}</p>
              </>
            )
          )}
        </div>
      ) : null}

      {PACKAGE_READY.includes(c.work_status) && (
        <p className="text-sm text-amber-800">
          Your request package is already prepared. Adding a file means STS may update the package
          and ask you to approve it again.
        </p>
      )}

      {c.issues.length > 1 && (
        <div className="max-w-xl">
          <label htmlFor="evidence-issue" className={labelClass}>
            Which issue does this support?
          </label>
          <select
            id="evidence-issue"
            value={issue.id}
            onChange={(e) => setIssueId(Number(e.target.value))}
            className={inputClass}
          >
            {c.issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.violation_code
                  ? `${i.violation_description ?? 'Violation'} (${i.violation_code})`
                  : 'The whole inspection'}
              </option>
            ))}
          </select>
        </div>
      )}
      <DataQsEvidenceUpload
        key={issue.id}
        caseId={c.id}
        issueId={issue.id}
        titles={c.document_titles}
      />
      <p className="text-xs text-slate-600">
        Suggested: {issue.checklist.join('; ')}. These are suggestions, not a government standard.
      </p>
    </section>
  )
}
