import { ArrowRight, Download, FileImage, FileText, FileVideo } from 'lucide-react'
import { Children, type ReactNode } from 'react'

import { dataQsEvidenceUrl } from '../../api/dataqs'
import { StatusBadge } from '../../components/StatusBadge'
import { useDataQsBase, useDataQsCase, useResubmitDataQsCase } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCase, DataQsEvidence, DataQsIssue } from '../../types/dataqs'
import { formatDate, formatDateTime } from '../../utils/format'
import { DataQsAddEvidence } from './DataQsAddEvidence'
import { DataQsAssessmentHistory, DataQsTaskList } from './DataQsCaseActivity'
import { DataQsDeadlines } from './DataQsDeadlines'
import { DataQsEventSummary } from './DataQsEventSummary'
import { DataQsBookCall } from './DataQsBookCall'
import { DataQsFeeCard } from './DataQsFeeCard'
import { DataQsFiledCard } from './DataQsFiledCard'
import { DataQsFilingProofs } from './DataQsFilingProofs'
import { DataQsMessages } from './DataQsMessages'
import { DataQsEvidenceUpload } from './DataQsEvidenceUpload'
import { DataQsPackageReview } from './DataQsPackageReview'
import { DataQsPackageView } from './DataQsPackageView'
import { DataQsReviewStages } from './DataQsReviewStages'
import { DataQsSubmitPanel } from './DataQsSubmitPanel'
import { DataQsTimeline } from './DataQsTimeline'
import { DataQsVerification } from './DataQsVerification'
import { WORK_STATUS, auditLabel, fileSize } from './labels'
import { DataQsAppealPanel } from './staff/DataQsAppealPanel'
import { DataQsAssessmentPanel } from './staff/DataQsAssessmentPanel'
import { DataQsCloseFile } from './staff/DataQsCloseFile'
import { DataQsCorrespondencePanel } from './staff/DataQsCorrespondencePanel'
import { DataQsEmailLog } from './staff/DataQsEmailLog'
import { DataQsOtpCard } from './DataQsOtpCard'
import { DataQsOwnerPanel } from './staff/DataQsOwnerPanel'
import { DataQsOtpStaffPanel } from './staff/DataQsOtpStaffPanel'
import { DataQsPackageBuilder } from './staff/DataQsPackageBuilder'
import { DataQsSubmissionConsole } from './staff/DataQsSubmissionConsole'
import { primaryButton, secondaryButton } from './ui'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  )
}

/** A card whose body opens on demand: tools and records that aren't the next step right now. */
function FoldCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-surface p-5">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

/** A labelled group of cards; left out when none of its cards apply. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">{title}</h2>
      {children}
    </section>
  )
}

/** Open STS tasks that make a staff tool the next step. */
const ASSESS_TASKS = ['ASSESS_CASE', 'SPECIALIST_REVIEW', 'WAIT_EXTERNAL']
const PACKAGE_TASKS = ['PREPARE_PACKAGE', 'REVISE_PACKAGE']
/** Stages where the carrier is gathering evidence. */
const CARRIER_STEPS: DataQsCase['work_status'][] = ['DRAFT', 'EVIDENCE_NEEDED']

/** One DataQs case: what is wrong, its evidence, what's missing and what happens next. Shared by
 * the client portal and the STS portal; the server says what this user may do (can_upload, …). */
export function DataQsCaseRoom({ caseId }: { caseId: number }) {
  const { data, isPending, error } = useDataQsCase(caseId)
  if (isPending) return <p className="text-sm text-slate-500">Loading the case…</p>
  if (error) return <p className="text-sm text-red-700">Could not load the case: {error.message}</p>
  return <Room dataqsCase={data} />
}

/**
 * The case, top to bottom: a summary with the next step; what to do now; where the request
 * stands; the request itself; messages and history; then (STS only) the tools and records that
 * aren't the next step.
 */
function Room({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const filing = c.can_file || c.attempts.some((a) => a.status !== 'CONFIRMED')
  const assessDue =
    c.can_assess &&
    (c.assessments.length === 0 || c.tasks.some((t) => ASSESS_TASKS.includes(t.kind)))
  const packageDue =
    c.can_build_package &&
    (c.packages.length === 0 || c.tasks.some((t) => PACKAGE_TASKS.includes(t.kind)))
  const agencyDue = c.can_record_correspondence && c.work_status === 'MONITORING'
  // The carrier adds files after submitting from one place in "Your next steps" (a draft's
  // files go in with each issue below).
  const addEvidence = !staff && c.can_upload && c.work_status !== 'DRAFT'
  // How STS gets the FMCSA login code: asked of the carrier once the request is submitted.
  // The $50 DataQs fee comes first; STS starts (and asks about FMCSA sign-in) once it's paid.
  const feeDue = c.fee?.status === 'UNPAID'
  const otpCard =
    !feeDue &&
    c.work_status !== 'DRAFT' &&
    c.work_status !== 'CLOSED' &&
    (c.can_set_otp_preference || c.otp_preference !== null)
  return (
    <div className="space-y-8">
      <CaseSummary dataqsCase={c} staff={staff} />

      <Section title={staff ? 'To do now' : 'Your next steps'}>
        {feeDue && (
          <Card title={staff ? 'Waiting for the DataQs fee' : 'Pay the DataQs filing fee'}>
            <DataQsFeeCard dataqsCase={c} />
          </Card>
        )}
        {c.missing_items.length > 0 && (
          <Card title="Still needed">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {c.missing_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        )}
        {/* STS asked for evidence: add it, then send the case back */}
        {addEvidence && c.work_status === 'EVIDENCE_NEEDED' && <DataQsAddEvidence dataqsCase={c} />}
        {c.can_resubmit && <ResubmitCard dataqsCase={c} />}
        {c.can_approve && <PackageCard dataqsCase={c} />}
        {addEvidence && c.work_status !== 'EVIDENCE_NEEDED' && <DataQsAddEvidence dataqsCase={c} />}
        {otpCard && (
          <Card
            title={
              c.otp_preference?.method === 'AUTHORIZED_AGENT'
                ? 'FMCSA Portal access for STS'
                : 'FMCSA login code'
            }
          >
            {staff ? <DataQsOtpStaffPanel dataqsCase={c} /> : <DataQsOtpCard dataqsCase={c} />}
          </Card>
        )}
        {c.tasks.length > 0 && (
          <Card title="Open tasks">
            <DataQsTaskList tasks={c.tasks} />
          </Card>
        )}
        {assessDue && (
          <Card title="Assess the case">
            <DataQsAssessmentPanel dataqsCase={c} />
          </Card>
        )}
        {packageDue && (
          <Card title={c.packages.length ? 'Revise the package' : 'Build the filing package'}>
            <DataQsPackageBuilder key={c.packages[0]?.id ?? 0} dataqsCase={c} />
          </Card>
        )}
        {staff && filing && (
          <Card title="File with DataQs">
            <DataQsSubmissionConsole dataqsCase={c} />
          </Card>
        )}
        {agencyDue && (
          <Card title="Record an agency event">
            <DataQsCorrespondencePanel key={c.row_version} dataqsCase={c} />
          </Card>
        )}
        {c.can_propose_review && (
          <Card title="Appeal">
            <DataQsAppealPanel key={c.row_version} dataqsCase={c} />
          </Card>
        )}
      </Section>

      <Section title="Where it stands">
        {c.issues.some((i) => i.verification_status !== null) && (
          <Card title="Correction check">
            <DataQsVerification dataqsCase={c} />
          </Card>
        )}
        {c.gov_request_id && (
          <Card title="Filed with DataQs">
            <DataQsFiledCard dataqsCase={c} />
          </Card>
        )}
        {c.attempts.some((a) => a.status === 'CONFIRMED') && (
          <Card title="Proof of filing">
            <DataQsFilingProofs dataqsCase={c} />
          </Card>
        )}
        {c.clocks.length > 0 && (
          <Card title="Deadlines">
            <DataQsDeadlines dataqsCase={c} />
          </Card>
        )}
        {c.review_cycles.length > 0 && (
          <Card title="Review stages">
            <DataQsReviewStages dataqsCase={c} />
          </Card>
        )}
        {c.assessments.length > 0 && (
          <Card title="STS assessment">
            <DataQsAssessmentHistory assessments={c.assessments} />
          </Card>
        )}
      </Section>

      <Section title="The request">
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
        <Card title="The inspection">
          <DataQsEventSummary
            event={c.event}
            eligibility={c.eligibility}
            carrierName={c.carrier_name}
            usdotNumber={c.usdot_number}
          />
        </Card>
        {!c.can_approve && <PackageCard dataqsCase={c} />}
        {c.authorizations.length > 0 && (
          <Card title="Authorization">
            <ul className="space-y-1 text-sm text-slate-700">
              {c.authorizations.map((a) => (
                <li key={`${a.kind}-${a.approved_at}`}>
                  <span className="font-medium text-slate-900">
                    {a.kind === 'SERVICE_CONSENT'
                      ? 'Authorized STS to act on this request'
                      : 'Approved the request package'}
                  </span>
                  {' · '}
                  {a.signer_name}
                  {a.signer_title && `, ${a.signer_title}`} on {formatDateTime(a.approved_at)}
                  {/* Which wording was agreed to: STS's record */}
                  {staff && (
                    <span className="text-xs text-slate-600">
                      {' '}
                      (text version {a.terms_version})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section title="Messages and history">
        {c.can_book_call && (
          <Card title={staff ? 'Book a call for the carrier' : 'Talk to your STS specialist'}>
            <DataQsBookCall dataqsCase={c} />
          </Card>
        )}
        {(c.can_message || c.messages.length > 0) && (
          <Card title={staff ? 'Messages to the carrier' : 'Messages from STS'}>
            <DataQsMessages dataqsCase={c} />
          </Card>
        )}
        <Card title="Timeline">
          <DataQsTimeline events={c.timeline} />
        </Card>
      </Section>

      {staff && (
        <Section title="STS tools and records">
          {c.can_assign && (
            <Card title="Case specialist">
              <DataQsOwnerPanel key={c.row_version} dataqsCase={c} />
            </Card>
          )}
          {c.can_assess && !assessDue && (
            <FoldCard title="Reassess the case">
              <DataQsAssessmentPanel dataqsCase={c} />
            </FoldCard>
          )}
          {c.can_build_package && !packageDue && (
            <FoldCard title="Revise the package">
              <DataQsPackageBuilder key={c.packages[0]?.id ?? 0} dataqsCase={c} />
            </FoldCard>
          )}
          {c.can_record_correspondence && !agencyDue && (
            <FoldCard title="Record an agency event">
              <DataQsCorrespondencePanel key={c.row_version} dataqsCase={c} />
            </FoldCard>
          )}
          {c.emails && c.emails.length > 0 && (
            <FoldCard title={`Emails (${c.emails.length})`}>
              <DataQsEmailLog emails={c.emails} />
            </FoldCard>
          )}
          {c.audit && c.audit.length > 0 && (
            <FoldCard title={`Audit trail (${c.audit.length})`}>
              <ol className="space-y-1 text-sm">
                {c.audit.map((event, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3">
                    <span className="w-full shrink-0 text-xs text-slate-600 sm:w-40">
                      {formatDateTime(event.at)}
                    </span>
                    <span className="text-slate-800" title={event.action}>
                      {auditLabel(event.action)}
                    </span>
                    <span className="text-slate-600">{event.actor_name ?? 'Automatic'}</span>
                  </li>
                ))}
              </ol>
            </FoldCard>
          )}
          {c.can_close && (
            <FoldCard title="Close the file">
              <DataQsCloseFile key={c.row_version} dataqsCase={c} />
            </FoldCard>
          )}
        </Section>
      )}
    </div>
  )
}

/** The case at a glance: who, which inspection, where it is, who handles it, and what's next. */
function CaseSummary({ dataqsCase: c, staff }: { dataqsCase: DataQsCase; staff: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">DataQs case {c.id}</h1>
        <StatusBadge {...WORK_STATUS[c.work_status]} />
        {staff && c.organization_name && !c.held_by_sts && (
          <span className="text-sm text-slate-600">for {c.organization_name}</span>
        )}
      </div>
      {staff && c.work_status === 'DRAFT' && (
        <p className="mt-3 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
          {c.held_by_sts
            ? `Held by STS: USDOT ${c.usdot_number} has no client account in CarrierIQ yet. This draft moves to the carrier’s company, and its account owner is emailed to sign it, once an STS admin verifies USDOT ${c.usdot_number} for a client account on the Accounts page.`
            : `Waiting for ${c.organization_name ?? 'the carrier'}’s account owner to add evidence, sign the authorization and submit it to STS.`}
        </p>
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Carrier" sub={`USDOT ${c.usdot_number}`}>
          {c.carrier_name ?? '—'}
        </Fact>
        <Fact
          label="Inspection"
          sub={
            c.inspection_report_number
              ? `Report ${c.inspection_report_number}`
              : `FMCSA ID ${c.source_event_id}`
          }
        >
          {c.event_date ? formatDate(c.event_date) : 'Date unknown'}
          {c.event_state && ` · ${c.event_state}`}
        </Fact>
        <Fact label="DataQs request" mono={!!c.gov_request_id}>
          {c.gov_request_id ?? <span className="text-slate-600">Not filed yet</span>}
        </Fact>
        <Fact label="STS specialist">
          {c.owner_name ?? <span className="text-slate-600">Not assigned yet</span>}
        </Fact>
      </dl>
      <div className="mt-5 flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
            Next step
          </div>
          <p className="text-sm font-medium text-slate-900">{c.next_action}</p>
          {c.next_deadline_at && (
            <p className="mt-0.5 text-xs text-slate-700">
              {c.next_deadline_label ?? 'Due'}: {formatDateTime(c.next_deadline_at)}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
function Fact({
  label,
  sub,
  mono = false,
  children,
}: {
  label: string
  sub?: string
  mono?: boolean
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>
        {children}
      </dd>
      {sub && <dd className="truncate font-mono text-xs text-slate-600">{sub}</dd>}
    </div>
  )
}

function IssueBlock({ dataqsCase: c, issue }: { dataqsCase: DataQsCase; issue: DataQsIssue }) {
  const staffView = usePortalMode() === 'internal'
  const files = c.evidence.filter((e) => e.links.some((link) => link.issue_id === issue.id))
  const upload = (
    <>
      <DataQsEvidenceUpload caseId={c.id} issueId={issue.id} titles={c.document_titles} />
      <p className="mt-2 text-xs text-slate-600">
        Suggested: {issue.checklist.join('; ')}. These are suggestions, not a government standard.
      </p>
    </>
  )
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
        <div className="text-xs text-slate-600">{issue.reason_label}</div>
        {staffView && issue.dataqs_reason_label && (
          <div className="text-xs text-slate-600">DataQs: {issue.dataqs_reason_label}</div>
        )}
        {issue.outcome && (
          <div className="mt-1">
            <StatusBadge
              label={issue.outcome === 'FULL_CORRECTION' ? 'Corrected' : 'Not corrected'}
              tone={issue.outcome === 'FULL_CORRECTION' ? 'ok' : 'down'}
            />
          </div>
        )}
      </div>
      {(issue.recorded_value || issue.requested_value) && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-600">The record says</dt>
            <dd>{issue.recorded_value ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-600">It should say</dt>
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
          <ul className="mt-2 space-y-2">
            {files.map((file) => (
              <EvidenceRow key={file.id} caseId={c.id} file={file} issueId={issue.id} />
            ))}
          </ul>
        )}
      </div>

      {c.can_upload &&
        (files.length === 0 && CARRIER_STEPS.includes(c.work_status) ? (
          // Evidence is what's needed next: the form is open from the start.
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-900">Add evidence</h3>
            {upload}
          </div>
        ) : (
          <details className="group">
            <summary className="cursor-pointer py-2.5 sm:py-0 text-sm font-medium text-accent-strong">
              Add a file
            </summary>
            <div className="mt-2">{upload}</div>
          </details>
        ))}
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
  const url = dataQsEvidenceUrl(base, caseId, file.id)
  const Icon = file.mime_type.startsWith('image/')
    ? FileImage
    : file.mime_type.startsWith('video/')
      ? FileVideo
      : FileText
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm sm:flex-nowrap">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={url}
          className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
        >
          {file.title ?? file.file_name}
        </a>
        {file.title && <div className="truncate text-xs text-slate-600">{file.file_name}</div>}
        {relevance && (
          <p className="mt-2 rounded-md border-l-2 border-accent bg-surface px-2.5 py-1.5 text-slate-700">
            {relevance}
          </p>
        )}
        <div className="mt-2 text-xs text-slate-600">
          {fileSize(file.size_bytes)}
          {file.document_date && ` · dated ${formatDate(file.document_date)}`}
          {file.uploaded_by_name && ` · uploaded by ${file.uploaded_by_name}`}
          {` · ${formatDate(file.uploaded_at.slice(0, 10))}`}
        </div>
      </div>
      <a
        href={url}
        className={`${secondaryButton} inline-flex shrink-0 items-center gap-1.5`}
        aria-label={`Download ${file.title ?? file.file_name}`}
      >
        <Download className="size-4" aria-hidden />
        Download
      </a>
    </li>
  )
}

/** Carrier: after adding the evidence STS asked for, send the case back. */
function ResubmitCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const resubmit = useResubmitDataQsCase(c.id)
  return (
    <Card title="Send it back to STS">
      <p className="text-sm text-slate-700">
        When you’ve added the evidence STS asked for, send the case back for review.
      </p>
      {resubmit.isError && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          Could not send: {resubmit.error.message}
        </p>
      )}
      <button
        type="button"
        className={`${primaryButton} mt-3`}
        disabled={resubmit.isPending}
        onClick={() => resubmit.mutate(c.row_version)}
      >
        {resubmit.isPending ? 'Sending…' : 'Send back to STS'}
      </button>
    </Card>
  )
}

/** The current filing package (and, for STS, earlier versions); the carrier approves it here. */
function PackageCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [current, ...older] = c.packages
  if (!current) return null
  return (
    <Card title={c.can_approve ? 'Review the request package' : 'Filing package'}>
      <DataQsPackageView pkg={current} />
      {c.can_approve && <DataQsPackageReview key={current.id} dataqsCase={c} pkg={current} />}
      {older.length > 0 && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer py-2.5 sm:py-0 text-sm text-slate-600">
            Earlier versions ({older.length})
          </summary>
          <div className="mt-3 space-y-6">
            {older.map((pkg) => (
              <DataQsPackageView key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </details>
      )}
    </Card>
  )
}
