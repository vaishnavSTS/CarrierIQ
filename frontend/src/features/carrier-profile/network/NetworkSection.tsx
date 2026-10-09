import { SOURCES } from '../../../utils/sources'
import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'

import { SourceTag } from '../../../components/SourceTag'
import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierNetwork } from '../../../hooks/useNetwork'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CheckStatus, LinkedCarrier } from '../../../types/network'
import { formatDate, formatDateTime, formatPhone, humanize } from '../../../utils/format'
import type { Tone } from '../../../utils/status'
import { Empty, Section } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'
import { type FlagLevel, brokerFlags } from './brokerFlags'
import { TeamNotes } from './TeamNotes'

const LEVEL: Record<FlagLevel, { icon: LucideIcon; tone: Tone; label: string; ring: string }> = {
  alert: { icon: CircleAlert, tone: 'down', label: 'alert', ring: 'border-red-200' },
  attention: { icon: AlertTriangle, tone: 'warn', label: 'attention', ring: 'border-amber-600/40' },
  info: { icon: Info, tone: 'neutral', label: 'info', ring: 'border-slate-200' },
}

const CHECK_TONE: Record<CheckStatus, Tone> = {
  ok: 'ok',
  attention: 'warn',
  alert: 'down',
  info: 'neutral',
  unknown: 'pending',
}

const SHARE_LABEL: Record<string, string> = {
  phone: 'Phone',
  email: 'Email',
  address: 'Address and unit',
  building: 'Building (other unit)',
  officer: 'Officer',
}

function SubHeading({
  children,
  note,
  source,
}: {
  children: ReactNode
  note?: string
  source?: string
}) {
  return (
    <div className="mb-2 mt-8 first:mt-0">
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium uppercase tracking-wide text-slate-500">{children}</span>
        {source && <SourceTag>{source}</SourceTag>}
      </h3>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

function shownValue(kind: string, value: string | null): string {
  if (!value) return '—'
  return kind === 'phone' ? formatPhone(value) : value
}

function LinkedTable({ carriers }: { carriers: LinkedCarrier[] }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Carrier</th>
            <th className={cellClass}>Shares</th>
            <th className={cellClass}>Status</th>
            <th className={cellClass}>Registered</th>
            <th className={cellClass}>Signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {carriers.map((c) => (
            <tr key={c.usdot_number} className="align-top">
              <td className={cellClass}>
                <Link
                  to={`/carriers/${c.usdot_number}`}
                  className="font-mono text-slate-900 underline hover:text-slate-600"
                >
                  USDOT {c.usdot_number}
                </Link>
                <div className="text-xs text-slate-500">
                  {c.legal_name ?? 'Unknown'}
                  {c.city && ` · ${c.city}, ${c.state}`}
                </div>
              </td>
              <td className={cellClass}>
                <ul className="space-y-0.5 text-xs">
                  {c.shares.map((s) => (
                    <li key={s.kind}>
                      <span className="text-slate-500">{SHARE_LABEL[s.kind] ?? s.kind}:</span>{' '}
                      <span className="text-slate-900">{shownValue(s.kind, s.value)}</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className={cellClass}>
                {c.status ? (
                  <StatusBadge
                    label={c.status.toLowerCase()}
                    tone={c.status === 'ACTIVE' ? 'ok' : 'neutral'}
                  />
                ) : (
                  '—'
                )}
              </td>
              <td className={`${cellClass} whitespace-nowrap`}>{formatDate(c.registered)}</td>
              <td className={`${cellClass} whitespace-nowrap text-xs`}>
                {c.signal_id ? (
                  <Link
                    to={`?tab=intelligence&signal=${c.signal_id}`}
                    className="text-slate-900 underline hover:text-slate-600"
                  >
                    Review signal ›
                  </Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NetworkSection({ profile }: { profile: CarrierProfile }) {
  const { data, error, isPending } = useCarrierNetwork(profile.usdot_number)
  const [showBuilding, setShowBuilding] = useState(false)

  return (
    <Section id="network" title="Network & Identity">
      {isPending && (
        <p className="text-sm text-slate-500">
          Checking FMCSA records for linked carriers and registration status…
        </p>
      )}
      {error && <p className="text-sm text-red-700">Could not load: {error.message}</p>}
      {data && (
        <NetworkBody
          data={data}
          profile={profile}
          showBuilding={showBuilding}
          onShowBuilding={() => setShowBuilding(true)}
        />
      )}
    </Section>
  )
}

function NetworkBody({
  data,
  profile,
  showBuilding,
  onShowBuilding,
}: {
  data: NonNullable<ReturnType<typeof useCarrierNetwork>['data']>
  profile: CarrierProfile
  showBuilding: boolean
  onShowBuilding: () => void
}) {
  const flags = brokerFlags(data, profile)
  const strong = data.linked_carriers.filter((c) => c.shares.some((s) => s.kind !== 'building'))
  const building = data.linked_carriers.filter((c) => c.shares.every((s) => s.kind === 'building'))
  const history = [
    ...profile.recent_changes.map((c) => ({
      key: `change-${c.attribute}-${c.changed_on}`,
      date: c.changed_on,
      title: `${humanize(c.attribute)} changed`,
      detail: `${c.old_value ?? '(empty)'} → ${c.new_value ?? '(empty)'}`,
    })),
    ...profile.timeline
      .filter(
        (e) => e.event_type === 'AUTHORITY_TRANSFERRED' || e.event_type === 'AUTHORITY_RENUMBERED',
      )
      .map((e) => ({
        key: `tl-${e.event_type}-${e.event_date}`,
        date: e.event_date,
        title: e.title,
        detail: e.description ?? '',
      })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <SubHeading
        note="Built from public FMCSA records. These are prompts for review, not findings."
        source={SOURCES.checks}
      >
        What a broker’s check may flag
      </SubHeading>
      {flags.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <CircleCheck className="size-4 text-emerald-700" aria-hidden />
          Nothing in the public records that broker vetting typically reacts to.
        </p>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => {
            const { icon: Icon, tone, label, ring } = LEVEL[f.level]
            return (
              <li key={f.key} className={`rounded-md border ${ring} px-3 py-2.5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-slate-700" aria-hidden />
                  <StatusBadge label={label} tone={tone} />
                  <span className="font-medium text-slate-900">{f.title}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{f.why}</p>
                {f.fix && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Usually resolved by: </span>
                    {f.fix}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <SubHeading
        note="Live checks against FMCSA's records, refreshed with the carrier."
        source={SOURCES.registration}
      >
        Registration health
      </SubHeading>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {data.registration_checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
            <span className="w-24 shrink-0">
              <StatusBadge label={c.status} tone={CHECK_TONE[c.status]} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">{c.label}</span>
              <span className="mt-0.5 block text-slate-700">{c.detail}</span>
              <SourceTag className="mt-0.5 block">
                {c.source}
                {c.as_of && ` · ${formatDate(c.as_of)}`}
              </SourceTag>
            </span>
          </li>
        ))}
      </ul>

      <SubHeading
        note={`Other FMCSA carriers with the same phone, email, address or officer. Checked ${formatDateTime(data.links_checked_at)}.`}
        source={SOURCES.linked}
      >
        Linked carriers
      </SubHeading>
      {strong.length === 0 ? (
        <Empty>
          No other carrier shares this carrier’s phone, email, address and unit, or officers.
        </Empty>
      ) : (
        <LinkedTable carriers={strong} />
      )}
      {building.length > 0 && (
        <div className="mt-3">
          {showBuilding ? (
            <>
              <p className="mb-2 text-xs text-slate-500">
                Same building, different unit: usually an apartment complex or office building.
              </p>
              <LinkedTable carriers={building} />
            </>
          ) : (
            <button
              type="button"
              onClick={onShowBuilding}
              className="text-xs text-slate-600 underline hover:text-slate-900"
            >
              {building.length} more carrier{building.length === 1 ? '' : 's'} at the same building
              (different units) ›
            </button>
          )}
        </div>
      )}

      <SubHeading
        note="Changes CarrierIQ has seen in FMCSA records since it first loaded this carrier, plus authority transfers."
        source={SOURCES.identityHistory}
      >
        Identity and ownership history
      </SubHeading>
      {history.length === 0 ? (
        <Empty>No name, contact, officer or authority-ownership changes recorded.</Empty>
      ) : (
        <ol className="space-y-2">
          {history.map((h) => (
            <li key={h.key} className="flex gap-4 text-sm">
              <span className="w-24 shrink-0 text-slate-500">{formatDate(h.date)}</span>
              <span>
                <span className="font-medium text-slate-900">{h.title}</span>
                <span className="block text-xs text-slate-600">{h.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <SubHeading
        note="Optional. Only for what no public source publishes, such as an ownership attestation on Highway."
        source={SOURCES.team}
      >
        Notes from your team
      </SubHeading>
      <TeamNotes usdotNumber={data.usdot_number} events={data.identity_events} />
    </>
  )
}
