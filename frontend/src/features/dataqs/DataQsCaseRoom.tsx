import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import { dataQsEvidenceUrl } from '../../api/dataqs'
import { StatusBadge } from '../../components/StatusBadge'
import { useDataQsBase, useDataQsCase } from '../../hooks/useDataQs'
import type { DataQsCase, DataQsEvidence, DataQsIssue } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import { DataQsEventSummary } from './DataQsEventSummary'
import { DataQsEvidenceUpload } from './DataQsEvidenceUpload'
import { DataQsSubmitPanel } from './DataQsSubmitPanel'
import { WORK_STATUS, fileSize } from './labels'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

/** One DataQs case: what is wrong, its evidence, what's missing and what happens next. Shared by
 * the client portal and the STS portal; the server says what this user may do (can_upload, …). */
export function DataQsCaseRoom({ caseId }: { caseId: number }) {
  const { data, isPending, error } = useDataQsCase(caseId)
  if (isPending) return <p className="text-sm text-slate-500">Loading the case…</p>
  if (error) return <p className="text-sm text-red-700">Could not load the case: {error.message}</p>
  return <Room dataqsCase={data} />
}

function Room({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const status = WORK_STATUS[c.work_status]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">DataQs case #{c.id}</h1>
        <StatusBadge {...status} />
        {c.organization_name && (
          <span className="text-sm text-slate-500">{c.organization_name}</span>
        )}
      </div>
      <p className="text-sm text-slate-700">
        <span className="font-medium">Next step:</span> {c.next_action}
      </p>

      {c.missing_items.length > 0 && (
        <Card title="Still needed">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {c.missing_items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="The inspection">
        <DataQsEventSummary
          event={c.event}
          eligibility={c.eligibility}
          carrierName={c.carrier_name}
          usdotNumber={c.usdot_number}
        />
      </Card>

      <Card title={`What’s wrong (${c.issues.length})`}>
        <div className="space-y-4">
          {c.issues.map((issue) => (
            <IssueBlock key={issue.id} dataqsCase={c} issue={issue} />
          ))}
        </div>
      </Card>

      {c.can_submit && (
        <Card title="Authorize and submit">
          <DataQsSubmitPanel dataqsCase={c} />
        </Card>
      )}

      {c.authorizations.length > 0 && (
        <Card title="Authorization">
          <ul className="space-y-1 text-sm text-slate-700">
            {c.authorizations.map((a) => (
              <li key={`${a.kind}-${a.approved_at}`}>
                Signed by {a.signer_name}
                {a.signer_title && `, ${a.signer_title}`} on {formatDateTime(a.approved_at)}{' '}
                <span className="text-xs text-slate-500">(text version {a.terms_version})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {c.audit && (
        <Card title="Audit trail (STS only)">
          <ol className="space-y-1 text-sm">
            {c.audit.map((event, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-500">
                  {formatDateTime(event.at)}
                </span>
                <span className="font-mono text-xs text-slate-700">{event.action}</span>
                <span className="text-slate-500">{event.actor_name ?? 'System'}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

function IssueBlock({ dataqsCase: c, issue }: { dataqsCase: DataQsCase; issue: DataQsIssue }) {
  const files = c.evidence.filter((e) => e.links.some((link) => link.issue_id === issue.id))
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div>
        <div className="text-sm font-medium text-slate-900">
          {issue.violation_code ? (
            <>
              {issue.violation_description ?? 'Violation'}{' '}
              <span className="font-mono text-xs font-normal text-slate-500">
                {issue.violation_code}
              </span>
            </>
          ) : (
            'The whole inspection'
          )}
        </div>
        <div className="text-xs text-slate-500">{issue.reason_label}</div>
      </div>
      {(issue.recorded_value || issue.requested_value) && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">The record says</dt>
            <dd>{issue.recorded_value ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">It should say</dt>
            <dd>{issue.requested_value ?? '—'}</dd>
          </div>
        </dl>
      )}
      <p className="whitespace-pre-line text-sm text-slate-700">{issue.factual_basis}</p>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Evidence ({files.length})
        </h3>
        {files.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No files yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {files.map((file) => (
              <EvidenceRow key={file.id} caseId={c.id} file={file} issueId={issue.id} />
            ))}
          </ul>
        )}
      </div>

      {c.can_upload && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-accent-strong">
            Add a file
          </summary>
          <div className="mt-2">
            <DataQsEvidenceUpload caseId={c.id} issueId={issue.id} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Suggested: {issue.checklist.join('; ')}. These are suggestions, not a government
            standard.
          </p>
        </details>
      )}
    </div>
  )
}

function EvidenceRow({
  caseId,
  file,
  issueId,
}: {
  caseId: number
  file: DataQsEvidence
  issueId: number
}) {
  const base = useDataQsBase()
  const relevance = file.links.find((link) => link.issue_id === issueId)?.relevance
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      <a
        href={dataQsEvidenceUrl(base, caseId, file.id)}
        className="flex items-center gap-1.5 font-medium text-accent-strong hover:underline"
      >
        <Download className="size-3.5" aria-hidden />
        {file.file_name}
      </a>
      <span className="flex-1 text-slate-600">{relevance}</span>
      <span className="whitespace-nowrap text-xs text-slate-500">
        {fileSize(file.size_bytes)}
        {file.document_date && ` · dated ${formatDate(file.document_date)}`}
        {file.uploaded_by_name && ` · ${file.uploaded_by_name}`}
      </span>
    </li>
  )
}
