import { useState, type ReactNode } from 'react'

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
  ProcessAgent,
  Renewal,
} from '../../types/carrierAuthority'
import { formatDate, formatMoney, humanize, sourceLabel } from '../../utils/format'
import { statusTone, type Tone } from '../../utils/status'
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

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-slate-500 first:mt-0">
      {children}
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
  if (!required) return <span className="text-slate-500">Not required</span>
  if (onFile) return <span>Required · on file</span>
  // Only alarming while the authority is active; for inactive authority it is just a fact.
  return (
    <span className={active ? 'font-medium text-red-700' : 'text-slate-700'}>
      Required · not on file
    </span>
  )
}

function ProcessAgentLine({ agents }: { agents: ProcessAgent[] | null }) {
  if (agents === null) return null
  const motus = agents.filter((a) => a.source_system === 'MOTUS')
  const shown = motus.length > 0 ? motus : agents
  return (
    <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
      <span className="text-slate-500">Process agent (BOC-3): </span>
      {shown.length === 0 ? (
        <span className={motus.length === 0 ? 'text-amber-300' : ''}>
          None listed in FMCSA’s public BOC-3 data
        </span>
      ) : (
        <>
          {shown.map((a) => a.name).join(', ')}
          {shown[0].city && (
            <span className="text-slate-500">
              {' '}
              · {shown[0].city}
              {shown[0].state && `, ${shown[0].state}`}
            </span>
          )}
          <div className="mt-0.5 text-slate-500">
            {motus.length > 0
              ? 'From FMCSA Motus (current system); no filing date in the data'
              : 'Only in FMCSA’s old L&I system (frozen May 14, 2026), not in Motus; no filing date in the data'}
          </div>
        </>
      )}
    </div>
  )
}

function DocketCard({ docket, agents }: { docket: DocketDetail; agents: ProcessAgent[] | null }) {
  const required = docket.bipd_required ? Number(docket.bipd_required) : 0
  const onFile = docket.bipd_on_file ? Number(docket.bipd_on_file) : 0
  const short = docket.status === 'ACTIVE' && required > 0 && onFile < required
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-medium">
          {docket.prefix}
          {docket.number}
        </span>
        <div className="flex items-center gap-2">
          {docket.revocation_pending && <StatusBadge label="revocation pending" tone="warn" />}
          {docket.status && <StatusBadge label={docket.status} tone={statusTone(docket.status)} />}
        </div>
      </div>
      <div className="mt-1 text-slate-700">{docket.authority_type ?? 'Authority type unknown'}</div>
      <div className="mt-1 text-xs text-slate-500">
        Status from {sourceLabel(docket.status_source, docket.status_as_of)}
      </div>
      {docket.status_source !== 'CENSUS' && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate-500">BI&PD required</dt>
          <dd>{required ? formatMoney(required) : 'None'}</dd>
          <dt className="text-slate-500">BI&PD on file</dt>
          <dd className={short ? 'font-medium text-red-700' : ''}>
            {formatMoney(docket.bipd_on_file)}
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
              <th className={cellClass}>Source</th>
            )}
            <th className={cellClass}>Docket</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filings.map((f, i) => (
            <tr key={`${f.policy_number}-${f.effective_date}-${f.termination_date}-${i}`}>
              <td className={`${cellClass} whitespace-nowrap`}>
                {TYPE_LABEL[f.insurance_type ?? ''] ?? f.insurance_type ?? '—'}
                {f.insurance_class && CLASS_LABEL[f.insurance_class] && (
                  <span className="ml-1 text-xs text-slate-500">
                    {CLASS_LABEL[f.insurance_class]}
                  </span>
                )}
              </td>
              <td className={cellClass}>{f.insurer ?? '—'}</td>
              <td className={`${cellClass} font-mono text-xs`}>{f.policy_number ?? '—'}</td>
              <td className={`${cellClass} text-right tabular-nums`}>
                {formatMoney(f.coverage_amount)}
              </td>
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
                      humanize((f.status ?? '').toLowerCase())
                    )}
                  </td>
                </>
              ) : (
                <td className={`${cellClass} text-xs text-slate-500`}>
                  {sourceLabel(f.source_system, f.status_as_of)}
                </td>
              )}
              <td className={`${cellClass} font-mono text-xs`}>{f.docket ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const RENEWAL_BADGE: Record<Renewal['state'], { label: string; tone: Tone }> = {
  pattern: { label: 'estimate', tone: 'neutral' },
  upcoming: { label: 'renewal soon', tone: 'pending' },
  unconfirmed: { label: 'cannot confirm', tone: 'warn' },
  passed: { label: 'still on file', tone: 'ok' },
}

function Renewals({ renewals }: { renewals: Renewal[] }) {
  if (renewals.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {renewals.map((r) => {
        const badge = RENEWAL_BADGE[r.state]
        return (
          <div
            key={`${r.docket}-${r.insurance_type}`}
            className="rounded-md border border-slate-200 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                Usual renewal: {TYPE_LABEL[r.insurance_type] ?? r.insurance_type}{' '}
                <span className="font-mono text-xs text-slate-500">{r.docket}</span>
              </span>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                Next expected around {formatDate(r.expected)}
                <StatusBadge label={badge.label} tone={badge.tone} />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-600">{r.summary}</p>
          </div>
        )
      })}
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
        FMCSA classifies this carrier as <strong>{labels.join(', ')}</strong>. Only carriers
        authorized for hire need operating authority (an MC, MX or FF number), so FMCSA holds no
        authority or insurance filings for this one.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Its insurance is not filed with FMCSA, so it can’t be checked here.
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

  return (
    <Section id="authority" title="Authority & Insurance">
      {isPending && <p className="text-sm text-slate-500">Loading authority and insurance…</p>}
      {error && (
        <p className="text-sm text-red-700">Could not load authority data: {error.message}</p>
      )}
      {data && (
        <>
          <SubHeading>Operating authority</SubHeading>
          {data.dockets.length === 0 && needsForHireAuthority(classification) === false ? (
            <NotForHire classification={classification} />
          ) : data.dockets.length === 0 ? (
            <Empty>No MC, MX or FF docket found in FMCSA records.</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.dockets.map((d) => (
                <DocketCard
                  key={`${d.prefix}${d.number}`}
                  docket={d}
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

          <SubHeading>Insurance on file</SubHeading>
          {data.current_insurance.length === 0 ? (
            <Empty>No insurance filings on file in FMCSA records.</Empty>
          ) : (
            <FilingsTable filings={data.current_insurance} past={false} />
          )}
          <Renewals renewals={data.renewals ?? []} />

          <SubHeading>Insurance history</SubHeading>
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

          <SubHeading>Authority history</SubHeading>
          {data.authority_history.length === 0 ? (
            <Empty>No authority actions in FMCSA records.</Empty>
          ) : (
            <>
              <table className={tableClass}>
                <thead className={headClass}>
                  <tr>
                    <th className={cellClass}>Date</th>
                    <th className={cellClass}>Docket</th>
                    <th className={cellClass}>Action</th>
                    <th className={cellClass}>Authority type</th>
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
                      <td className={`${cellClass} font-mono text-xs`}>{a.docket}</td>
                      <td className={cellClass}>{humanize(a.action.toLowerCase())}</td>
                      <td className={`${cellClass} text-xs text-slate-500`}>
                        {a.authority_type ? humanize(a.authority_type.toLowerCase()) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
