import { SOURCES } from '../../utils/sources'
import { useState, type ReactNode } from 'react'

import { NotLoaded } from '../../components/NotLoaded'
import { SourceTag } from '../../components/SourceTag'
import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierAuthority } from '../../hooks/useCarrierAuthority'
import {
  classificationLabel,
  classifications,
  needsForHireAuthority,
} from '../../utils/classification'
import type {
  DocketDetail,
  InsuranceFiling,
  AuthorityAction,
  ProcessAgent,
  Renewal,
} from '../../types/carrierAuthority'
import { formatDate, formatDocket, formatMoney, humanize, sourceLabel } from '../../utils/format'
import { statusTone } from '../../utils/status'
import { Empty, Section } from './Section'
import { cellClass, headClass, tableClass } from './styles'

const TYPE_LABEL: Record<string, string> = {
  BIPD: 'BI&PD (liability)',
  CARGO: 'Cargo',
  BOND: 'Surety bond',
  TRUST_FUND: 'Trust fund',
}
const CLASS_LABEL: Record<string, string> = { P: 'Primary', E: 'Excess' }
const PREVIEW_ROWS = 10
const SYSTEM_LABEL: Record<string, string> = { MOTUS: 'Motus', LEGACY_LI: 'L&I (old system)' }

/*
 * Empty values, one rule for the whole tab: "Unknown" when FMCSA's record does not say,
 * "None" / "None on file" when FMCSA says there is none, "—" only for a missing text field.
 */

/** "MC123456" or "MC 123456" -> "MC 123456" */
function docketText(docket: string): string {
  const match = /^([A-Za-z]+)s*(d+)$/.exec(docket.trim())
  return match ? formatDocket(match[1].toUpperCase(), match[2]) : docket
}

function authorityTypeLabel(type: string | null): string {
  return type ? humanize(type.toLowerCase()) : 'Authority type unknown'
}

/** When FMCSA first granted this docket's authority, from the authority history. */
function grantDate(history: AuthorityAction[], docket: DocketDetail): string | null {
  const key = `${docket.prefix}${docket.number}`
  const dates = history
    .filter(
      (a) =>
        a.docket.replace(/s/g, '') === key &&
        a.action_date &&
        /GRANT/i.test(a.action) &&
        !/NOT GRANT/i.test(a.action),
    )
    .map((a) => a.action_date as string)
    .sort()
  return dates[0] ?? null
}

/** "7 yr" / "5 mo" from an ISO date to today */
function ageSince(value: string): string {
  const months = Math.floor(
    (Date.now() - new Date(`${value}T00:00:00Z`).getTime()) / (30.44 * 24 * 3600 * 1000),
  )
  return months >= 12 ? `${Math.floor(months / 12)} yr` : `${Math.max(months, 0)} mo`
}

/** Coverage, with the layer it sits on for excess policies. */
function coverageText(f: InsuranceFiling): string {
  const amount = formatMoney(f.coverage_amount)
  return f.insurance_class === 'E' && f.underlying_limit
    ? `${amount} excess over ${formatMoney(f.underlying_limit)}`
    : amount
}

function SubHeading({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <h3 className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-x-3 text-xs first:mt-0">
      <span className="font-medium uppercase tracking-wide text-slate-500">{children}</span>
      {source && <SourceTag>{source}</SourceTag>}
    </h3>
  )
}

function YesNo({
  required,
  onFile,
  active,
}: {
  required: boolean | null
  onFile: boolean | null
  active: boolean
}) {
  if (required === null) return <span className="text-slate-500">Unknown</span>
  if (!required) return <span className="text-slate-500">Not required</span>
  if (onFile) return <span>Required · on file</span>
  if (onFile === null) return <span>Required · unknown if on file</span>
  // Only alarming while the authority is active; for inactive authority it is just a fact.
  return (
    <span className={active ? 'font-medium text-red-700' : 'text-slate-700'}>
      Required · not on file
    </span>
  )
}

function ProcessAgentLine({ agents }: { agents: ProcessAgent[] | null }) {
  if (agents === null) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
        <NotLoaded what="The process agent (BOC-3)" />
      </div>
    )
  }
  const motus = agents.filter((a) => a.source_system === 'MOTUS')
  const shown = motus.length > 0 ? motus : agents
  return (
    <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
      <span className="text-slate-500">Process agent (BOC-3): </span>
      {shown.length === 0 ? (
        <span className={motus.length === 0 ? 'text-amber-700' : ''}>
          None listed in FMCSA’s public BOC-3 data
        </span>
      ) : (
        <>
          {shown.map((a, i) => (
            <span key={`${a.name}-${i}`}>
              {i > 0 && '; '}
              {a.name}
              {(a.city || a.state) && (
                <span className="text-slate-500">
                  {' '}
                  ({[a.city, a.state].filter(Boolean).join(', ')})
                </span>
              )}
            </span>
          ))}
          <div className="mt-0.5 text-slate-500">
            {motus.length > 0
              ? 'Listed in Motus, FMCSA’s current system'
              : 'Listed only in FMCSA’s old L&I system (frozen May 14, 2026), not in Motus'}
          </div>
        </>
      )}
    </div>
  )
}

function DocketCard({
  docket,
  agents,
  granted,
}: {
  docket: DocketDetail
  agents: ProcessAgent[] | null
  /** First grant date from the authority history, if any */
  granted: string | null
}) {
  const required = docket.bipd_required ? Number(docket.bipd_required) : 0
  const onFile = docket.bipd_on_file ? Number(docket.bipd_on_file) : 0
  const short = docket.status === 'ACTIVE' && required > 0 && onFile < required
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-medium">{formatDocket(docket.prefix, docket.number)}</span>
        <div className="flex items-center gap-2">
          {docket.revocation_pending && <StatusBadge label="revocation pending" tone="warn" />}
          {docket.status && <StatusBadge label={docket.status} tone={statusTone(docket.status)} />}
        </div>
      </div>
      <div className="mt-1 text-slate-700">{authorityTypeLabel(docket.authority_type)}</div>
      {granted && (
        <div className="mt-0.5 text-slate-700">
          Authority {ageSince(granted)} · granted {formatDate(granted)}
        </div>
      )}
      <div className="mt-1 text-xs text-slate-500">
        Status: {sourceLabel(docket.status_source, docket.status_as_of)}
      </div>
      {docket.status_source !== 'CENSUS' && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate-500">BI&PD (liability) required</dt>
          <dd>
            {docket.bipd_required === null ? 'Unknown' : required ? formatMoney(required) : 'None'}
          </dd>
          <dt className="text-slate-500">BI&PD (liability) on file</dt>
          <dd className={short ? 'font-medium text-red-700' : ''}>
            {onFile ? formatMoney(onFile) : 'None on file'}
            {short && ' (below required)'}
          </dd>
          <dt className="text-slate-500">Cargo</dt>
          <dd>
            <YesNo
              required={docket.cargo_required}
              onFile={docket.cargo_on_file}
              active={docket.status === 'ACTIVE'}
            />
          </dd>
          <dt className="text-slate-500">Bond</dt>
          <dd>
            <YesNo
              required={docket.bond_required}
              onFile={docket.bond_on_file}
              active={docket.status === 'ACTIVE'}
            />
          </dd>
        </dl>
      )}
      <ProcessAgentLine agents={agents} />
    </div>
  )
}

const FILING_STATUS: Record<string, string> = {
  ACTIVE: 'Active',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REPLACED: 'Replaced by a new filing',
}

function filingStatus(status: string | null): string {
  if (!status) return 'Unknown'
  return FILING_STATUS[status] ?? humanize(status.toLowerCase())
}

/** The data sources of a set of filings, each named once (not repeated on every row). */
function filingSources(filings: InsuranceFiling[]): string {
  return [...new Set(filings.map((f) => sourceLabel(f.source_system, f.status_as_of)))]
    .filter((label) => label !== '—')
    .join('; ')
}

function FilingsTable({ filings, past }: { filings: InsuranceFiling[]; past: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Type</th>
            <th className={cellClass}>Insurer</th>
            <th className={cellClass}>Policy</th>
            <th className={`${cellClass} text-right`}>Coverage</th>
            <th className={cellClass}>Effective</th>
            {past ? (
              <>
                <th className={cellClass}>Ended</th>
                <th className={cellClass}>How it ended</th>
              </>
            ) : (
              <>
                <th className={cellClass}>Status</th>
                <th className={cellClass}>Cancellation date</th>
              </>
            )}
            <th className={cellClass}>Docket</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filings.map((f, i) => (
            <tr key={`${f.policy_number}-${f.effective_date}-${f.termination_date}-${i}`}>
              <td className={`${cellClass} whitespace-nowrap`}>
                {TYPE_LABEL[f.insurance_type ?? ''] ?? f.insurance_type ?? 'Unknown'}
                {f.insurance_class && CLASS_LABEL[f.insurance_class] && (
                  <span className="ml-1 text-xs text-slate-500">
                    {CLASS_LABEL[f.insurance_class]}
                  </span>
                )}
              </td>
              <td className={cellClass}>{f.insurer ?? 'Unknown'}</td>
              <td className={`${cellClass} font-mono text-xs`}>{f.policy_number ?? '—'}</td>
              <td className={`${cellClass} text-right tabular-nums`}>{coverageText(f)}</td>
              <td className={`${cellClass} whitespace-nowrap`}>{formatDate(f.effective_date)}</td>
              {past ? (
                <>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDate(f.termination_date)}
                  </td>
                  <td className={cellClass}>
                    {f.status === 'CANCELLED' ? (
                      <StatusBadge label="cancelled" tone="warn" />
                    ) : (
                      filingStatus(f.status)
                    )}
                  </td>
                </>
              ) : (
                <>
                  <td className={cellClass}>{filingStatus(f.status)}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {f.termination_date ? (
                      <span className="font-medium">{formatDate(f.termination_date)}</span>
                    ) : (
                      <span className="text-slate-500">None filed</span>
                    )}
                  </td>
                </>
              )}
              <td className={`${cellClass} font-mono text-xs`}>
                {f.docket ? docketText(f.docket) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const RENEWAL_STATE: Record<Renewal['state'], (r: Renewal) => string> = {
  pattern: () => 'An estimate from past filing dates; FMCSA publishes no renewal date.',
  upcoming: () => 'Expected within the next 30 days.',
  unconfirmed: (r) =>
    `Cannot be confirmed: the expected date is after FMCSA’s public data stopped updating${
      r.data_as_of ? ` (${formatDate(r.data_as_of)})` : ''
    }.`,
  passed: () => 'The expected date has passed and the current filing is still on file.',
}

function Renewals({ renewals }: { renewals: Renewal[] }) {
  if (renewals.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {renewals.map((r) => (
        <div
          key={`${r.docket}-${r.insurance_type}`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">
              Expected renewal: {TYPE_LABEL[r.insurance_type] ?? r.insurance_type}{' '}
              <span className="font-mono text-xs text-slate-500">{docketText(r.docket)}</span>
            </span>
            <span className="text-sm tabular-nums">{formatDate(r.expected)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Current filing effective {formatDate(r.current_effective)}; renewed each year since{' '}
            {formatDate(r.since)} ({r.filings} filing{r.filings === 1 ? '' : 's'}).{' '}
            {RENEWAL_STATE[r.state](r)}
          </p>
          <SourceTag className="mt-1 block">{SOURCES.renewal}</SourceTag>
        </div>
      ))}
    </div>
  )
}

function ShowMore({
  total,
  shown,
  onClick,
}: {
  total: number
  shown: number
  onClick: () => void
}) {
  if (total <= shown) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 text-xs text-slate-600 underline hover:text-slate-900"
    >
      Show all {total}
    </button>
  )
}

function NotForHire({ classification }: { classification: string | null }) {
  const labels = classifications(classification).map(classificationLabel)
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <p>
        FMCSA lists this carrier as <strong>{labels.join(', ')}</strong>. Only for-hire carriers
        need operating authority (an MC, MX or FF number), and FMCSA has no authority or insurance
        filings for this carrier.
      </p>
    </div>
  )
}

export function AuthoritySection({
  usdotNumber,
  classification,
}: {
  usdotNumber: number
  classification: string | null
}) {
  const { data, error, isPending } = useCarrierAuthority(usdotNumber)
  const [allInsurance, setAllInsurance] = useState(false)
  const [allActions, setAllActions] = useState(false)

  // A private carrier with nothing on file: one notice, not three empty sections.
  const notForHire =
    !!data &&
    data.dockets.length === 0 &&
    needsForHireAuthority(classification) === false &&
    data.current_insurance.length === 0 &&
    data.insurance_history.length === 0 &&
    data.authority_history.length === 0

  return (
    <Section id="authority" title="Authority & Insurance">
      {isPending && <p className="text-sm text-slate-500">Loading authority and insurance…</p>}
      {error && (
        <p className="text-sm text-red-700">Could not load authority data: {error.message}</p>
      )}
      {data && notForHire && <NotForHire classification={classification} />}
      {data && !notForHire && (
        <>
          <SubHeading source={SOURCES.authority}>Operating authority</SubHeading>
          {data.dockets.length === 0 ? (
            <Empty>No MC, MX or FF docket in FMCSA records.</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.dockets.map((d) => (
                <DocketCard
                  key={`${d.prefix}${d.number}`}
                  docket={d}
                  granted={grantDate(data.authority_history, d)}
                  agents={
                    data.process_agents === null || data.process_agents === undefined
                      ? null
                      : data.process_agents.filter(
                          (a) => a.docket === null || a.docket === `${d.prefix}${d.number}`,
                        )
                  }
                />
              ))}
            </div>
          )}

          <SubHeading source={filingSources(data.current_insurance) || SOURCES.insurance}>
            Insurance on file
          </SubHeading>
          {data.current_insurance.length === 0 ? (
            <Empty>No insurance filings on file with FMCSA.</Empty>
          ) : (
            <>
              <FilingsTable filings={data.current_insurance} past={false} />
              <p className="mt-2 text-xs text-slate-500">
                {data.current_insurance.some((f) => f.termination_date)
                  ? 'A cancellation date means the insurer has filed a notice with FMCSA that the policy ends on that date. FMCSA needs a replacement filing before then, or it revokes the authority.'
                  : 'No insurer has filed a cancellation notice for these policies.'}
              </p>
            </>
          )}
          <Renewals renewals={data.renewals ?? []} />

          <SubHeading source={SOURCES.insuranceHistory}>Insurance history</SubHeading>
          {data.insurance_history.length === 0 ? (
            <Empty>No past insurance filings in FMCSA records.</Empty>
          ) : (
            <>
              <FilingsTable
                filings={
                  allInsurance
                    ? data.insurance_history
                    : data.insurance_history.slice(0, PREVIEW_ROWS)
                }
                past
              />
              {!allInsurance && (
                <ShowMore
                  total={data.insurance_history.length}
                  shown={PREVIEW_ROWS}
                  onClick={() => setAllInsurance(true)}
                />
              )}
            </>
          )}

          <SubHeading source={SOURCES.authorityHistory}>Authority history</SubHeading>
          {data.authority_history.length === 0 ? (
            <Empty>No authority actions in FMCSA records.</Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className={headClass}>
                    <tr>
                      <th className={cellClass}>Date</th>
                      <th className={cellClass}>Docket</th>
                      <th className={cellClass}>Action</th>
                      <th className={cellClass}>Status after</th>
                      <th className={cellClass}>Authority type</th>
                      <th className={cellClass}>FMCSA system</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(allActions
                      ? data.authority_history
                      : data.authority_history.slice(0, PREVIEW_ROWS)
                    ).map((a, i) => (
                      <tr key={`${a.docket}-${a.action_date}-${a.action}-${i}`}>
                        <td className={`${cellClass} whitespace-nowrap`}>
                          {formatDate(a.action_date)}
                        </td>
                        <td className={`${cellClass} font-mono text-xs`}>{docketText(a.docket)}</td>
                        <td className={cellClass}>{humanize(a.action.toLowerCase())}</td>
                        <td className={`${cellClass} text-xs`}>
                          {a.status ? humanize(a.status.toLowerCase()) : '—'}
                        </td>
                        <td className={`${cellClass} text-xs text-slate-500`}>
                          {a.authority_type ? authorityTypeLabel(a.authority_type) : '—'}
                        </td>
                        <td className={`${cellClass} text-xs text-slate-500`}>
                          {SYSTEM_LABEL[a.source_system] ?? a.source_system}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!allActions && (
                <ShowMore
                  total={data.authority_history.length}
                  shown={PREVIEW_ROWS}
                  onClick={() => setAllActions(true)}
                />
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}
