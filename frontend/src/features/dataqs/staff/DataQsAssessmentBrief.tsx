import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import type { DataQsCase } from '../../../types/dataqs'
import { formatDate, formatDateTime, formatPhone } from '../../../utils/format'
import { stateName } from '../../carrier-profile/safety/usStates'
import { levelLabel } from '../../carrier-profile/safety/inspectionLevels'
import { WORK_STATUS, fileSize } from '../labels'

const CLOSING_SOON_DAYS = 30

/**
 * STS staff, above the assessment checks: the client's details, in the same order as the checks
 * (carrier authority, record identity, request category, timing, duplicates, evidence, state
 * plan), so each can be checked before it is ticked. Things that need a look are marked amber.
 * Never shown to the carrier. FMCSA's password is not part of it.
 */
export function DataQsAssessmentBrief({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const consent = c.authorizations.find((a) => a.kind === 'SERVICE_CONSENT' && !a.revoked_at)
  const challenged = c.issues.filter((i) => i.violation_code)
  const openOthers = (c.related_cases ?? []).filter((r) => r.work_status !== 'CLOSED')
  const daysLeft = c.eligibility.days_left
  const prior = c.prior_activity
  const contact = c.carrier_contact

  return (
    <details open={c.assessments.length === 0} className="rounded-xl bg-slate-50 p-4">
      <summary className="cursor-pointer py-2.5 sm:py-0 text-sm font-semibold text-slate-900">
        Client details to check
      </summary>
      <div className="mt-3 divide-y divide-slate-200 text-sm">
        <Part n={1} title="Carrier authority">
          <Row label="Client company">{c.organization_name ?? '—'}</Row>
          <Row label="Carrier verified by STS">
            {c.carrier_verified ? (
              <StatusBadge label="Verified" tone="ok" />
            ) : (
              <Flag>Not verified for this company: verify it on the Accounts page</Flag>
            )}
          </Row>
          <Row label="Authorization signed by">
            {consent ? (
              <>
                {consent.signer_name}
                {consent.signer_title && `, ${consent.signer_title}`} ·{' '}
                {formatDateTime(consent.approved_at)}
              </>
            ) : (
              <Flag>Not signed yet</Flag>
            )}
          </Row>
          <Row label="Client users">
            {(c.client_users ?? []).length === 0 ? (
              <Flag>No active users</Flag>
            ) : (
              <ul className="space-y-0.5">
                {c.client_users?.map((u) => (
                  <li key={u.email}>
                    <span className="font-medium text-slate-900">{u.full_name}</span>{' '}
                    <span className="text-xs text-slate-600">({u.role})</span> ·{' '}
                    <a href={`mailto:${u.email}`} className="text-accent-strong hover:underline">
                      {u.email}
                    </a>
                    {u.phone && (
                      <>
                        {' '}
                        ·{' '}
                        <a href={`tel:${u.phone}`} className="text-accent-strong hover:underline">
                          {formatPhone(u.phone)}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row label="FMCSA account">
            {contact?.email ? (
              <>
                <a href={`mailto:${contact.email}`} className="text-accent-strong hover:underline">
                  {contact.email}
                </a>
                {contact.phone && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={`tel:${contact.phone}`} className="text-accent-strong hover:underline">
                      {contact.phone}
                    </a>
                  </>
                )}
              </>
            ) : (
              <span className="text-slate-600">Not given (FMCSA Credentials in the portal)</span>
            )}
          </Row>
        </Part>

        <Part n={2} title="Record identity">
          <Row label="Carrier">
            {c.carrier_name ?? '—'} · USDOT <span className="font-mono">{c.usdot_number}</span>
          </Row>
          <Row label="Inspection">
            {c.event.inspection_date ? formatDate(c.event.inspection_date) : 'Date unknown'}
            {c.event.state && ` · ${c.event.state}`} · {levelLabel(c.event.level)}
            {c.event.location && ` · ${c.event.location}`}
          </Row>
          <Row label="Report number">
            <span className="font-mono">
              {c.inspection_report_number ?? c.event.report_number ?? '—'}
            </span>
            <span className="text-xs text-slate-600">
              {' '}
              · FMCSA ID {c.event.inspection_id || 'none (not in FMCSA’s data)'}
            </span>
          </Row>
          <Row label="Vehicle">
            {c.event.plate ? `${c.event.plate_state ?? ''} ${c.event.plate}`.trim() : 'No plate'}
            {c.event.vin && (
              <span className="font-mono text-xs text-slate-600"> · VIN {c.event.vin}</span>
            )}
          </Row>
          <Row label="Violations challenged">
            {challenged.length === 0 ? (
              'The whole inspection'
            ) : (
              <ul className="space-y-0.5">
                {challenged.map((i) => (
                  <li key={i.id}>
                    <span className="font-mono text-xs">{i.violation_code}</span>{' '}
                    {i.violation_description ?? 'Violation'}
                    <span className="text-xs text-slate-600">
                      {' · '}
                      {i.violation_unit === 'D'
                        ? 'driver'
                        : i.violation_unit
                          ? `unit ${i.violation_unit}`
                          : 'vehicle'}
                      {i.out_of_service && ' · out of service'}
                      {i.citation_number && ` · citation ${i.citation_number}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        </Part>

        <Part n={3} title="Request category">
          {c.issues.map((i) => (
            <Row key={i.id} label={i.violation_code ? `${i.violation_code}` : 'Whole inspection'}>
              <div>{i.reason_label}</div>
              {i.dataqs_reason_label && (
                <div className="text-xs text-slate-600">DataQs: {i.dataqs_reason_label}</div>
              )}
              {(i.recorded_value || i.requested_value) && (
                <div className="text-xs text-slate-700">
                  Says “{i.recorded_value ?? '—'}” → should say “{i.requested_value ?? '—'}”
                </div>
              )}
            </Row>
          ))}
        </Part>

        <Part n={4} title="Timing">
          <Row label="Review window ends">
            {c.eligibility.window_ends ? formatDate(c.eligibility.window_ends) : '—'}
            {daysLeft !== null &&
              (daysLeft < 0 ? (
                <Flag> · passed</Flag>
              ) : daysLeft <= CLOSING_SOON_DAYS ? (
                <Flag> · {daysLeft} days left</Flag>
              ) : (
                ` · ${daysLeft} days left`
              ))}
          </Row>
          {c.eligibility.internal_cutoff && (
            <Row label="STS’s target">File by {formatDate(c.eligibility.internal_cutoff)}</Row>
          )}
        </Part>

        <Part n={5} title="Duplicates">
          <Row label="Other requests on it">
            {(c.related_cases ?? []).length === 0 ? (
              'None'
            ) : (
              <ul className="space-y-0.5">
                {c.related_cases?.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/dataqs/cases/${r.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      Case {r.id}
                    </Link>{' '}
                    {r.same_company
                      ? '(this company)'
                      : `(${r.organization_name ?? 'another company'})`}{' '}
                    · {WORK_STATUS[r.work_status].label}
                    {r.gov_request_id && ` · DataQs ${r.gov_request_id}`} · {r.issues.join(', ')}
                  </li>
                ))}
              </ul>
            )}
            {openOthers.length > 0 && (
              <div>
                <Flag>Another open request covers this inspection</Flag>
              </div>
            )}
          </Row>
          <Row label="Carrier says">
            {!prior ? (
              '—'
            ) : (
              <>
                {prior.has_prior_request ? (
                  <Flag>
                    Earlier DataQs request{prior.prior_request_id && ` ${prior.prior_request_id}`}
                    {prior.prior_representative && ` (by ${prior.prior_representative})`}
                  </Flag>
                ) : (
                  'No earlier request'
                )}
                {prior.prior_decision && <div>Earlier decision: {prior.prior_decision}</div>}
                {prior.pending_court && (
                  <div>
                    <Flag>A court case is pending</Flag>
                  </div>
                )}
                {prior.notes && <div className="text-slate-700">{prior.notes}</div>}
              </>
            )}
          </Row>
        </Part>

        <Part n={6} title="Evidence">
          {c.issues.map((i) => {
            const files = c.evidence.filter((e) => e.links.some((l) => l.issue_id === i.id))
            return (
              <Row key={i.id} label={i.violation_code ?? 'Whole inspection'}>
                {files.length === 0 ? (
                  <Flag>No files yet</Flag>
                ) : (
                  <ul className="space-y-0.5">
                    {files.map((f) => (
                      <li key={f.id}>
                        {f.title ?? f.file_name}
                        <span className="text-xs text-slate-600">
                          {f.document_date && ` · dated ${formatDate(f.document_date)}`} ·{' '}
                          {fileSize(f.size_bytes)}
                          {f.links.find((l) => l.issue_id === i.id)?.relevance &&
                            ` · ${f.links.find((l) => l.issue_id === i.id)?.relevance}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Row>
            )
          })}
        </Part>

        <Part n={7} title="State plan">
          <Row label="Inspecting state">
            {c.event.state ? `${c.event.state} – ${stateName(c.event.state)}` : '—'}
            <div className="text-xs text-slate-600">
              Check that state’s DataQs rules and any state-specific requirements.
            </div>
          </Row>
        </Part>
      </div>
    </details>
  )
}

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {n}. {title}
      </h4>
      <dl className="space-y-1">{children}</dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 sm:grid-cols-[11rem_1fr]">
      <dt className="text-slate-600">{label}</dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </div>
  )
}

function Flag({ children }: { children: ReactNode }) {
  return <span className="font-medium text-amber-700">{children}</span>
}
