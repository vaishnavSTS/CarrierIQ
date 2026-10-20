import { SourceTag } from '../../../components/SourceTag'
import { signalSource, SOURCES } from '../../../utils/sources'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Disclosure } from '../../../components/Disclosure'
import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierSignals } from '../../../hooks/useCarrierSignals'
import { useCarrierNetwork } from '../../../hooks/useNetwork'
import type { ReviewStatus, Severity, Signal } from '../../../types/carrierSignals'
import { formatLocalDate } from '../../../utils/format'
import { severityTone } from '../../../utils/status'
import { Empty, Section, Stat } from '../Section'
import { EvidenceDrawer } from './EvidenceDrawer'
import { RelationshipView } from './RelationshipView'
import { TYPE_LABEL, TYPE_ORDER } from './labels'

const SEVERITIES: Severity[] = ['HIGH', 'MEDIUM', 'LOW', 'INFO']
const PREVIEW_CARDS = 5
const STATUSES: [ReviewStatus | 'ALL', string][] = [
  ['OPEN', 'Open'],
  ['REVIEWED', 'Reviewed'],
  ['DISMISSED', 'Dismissed'],
  ['ALL', 'All'],
]

function chipClass(selected: boolean): string {
  return `rounded-md px-2.5 py-1 text-xs ring-1 ring-inset ${
    selected
      ? 'bg-accent text-cta-ink ring-accent'
      : 'bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50'
  }`
}

/** The other carrier a shared-contact or shared-VIN signal is about (its key ends in its USDOT). */
function otherUsdot(signal: Signal): number | null {
  if (signal.signal_type !== 'SHARED_CONTACT' && signal.signal_type !== 'SHARED_VIN') return null
  const usdot = Number(signal.signal_key?.split(':').pop())
  return Number.isInteger(usdot) && usdot > 0 ? usdot : null
}

function SignalCard({
  signal,
  otherStatus,
  onOpen,
}: {
  signal: Signal
  /** ACTIVE | INACTIVE for the other carrier, when the signal links to one */
  otherStatus: string | null
  onOpen: () => void
}) {
  return (
    <li className="rounded-md border border-slate-200 px-3 py-2">
      <Disclosure
        summary={
          <>
            <StatusBadge
              label={signal.severity.toLowerCase()}
              tone={severityTone(signal.severity)}
            />
            <span className="font-medium text-slate-900">{signal.title}</span>
            {otherStatus && (
              <StatusBadge
                label={otherStatus === 'ACTIVE' ? 'active' : 'not active'}
                tone={otherStatus === 'ACTIVE' ? 'ok' : 'neutral'}
              />
            )}
            {signal.status !== 'OPEN' && (
              <StatusBadge label={signal.status.toLowerCase()} tone="pending" />
            )}
          </>
        }
      >
        <p className="text-sm text-slate-600">{signal.description}</p>
        {signal.status !== 'OPEN' && (
          <p className="mt-1 text-xs text-slate-600">
            {signal.status === 'REVIEWED' ? 'Reviewed' : 'Dismissed'}{' '}
            {formatLocalDate(signal.reviewed_at)}
            {signal.review_note && ` · “${signal.review_note}”`}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {signal.confidence.toLowerCase()} confidence · detected{' '}
            {formatLocalDate(signal.first_detected_at)}
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-md px-2.5 py-1 text-xs text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Evidence ({signal.evidence.length})
          </button>
        </div>
      </Disclosure>
    </li>
  )
}

function SignalGroup({
  type,
  signals,
  statusOf,
  onOpen,
}: {
  type: string
  signals: Signal[]
  /** Census status of another carrier, by USDOT */
  statusOf: (usdot: number) => string | null
  onOpen: (signal: Signal) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const counts = SEVERITIES.map((s) => [s, signals.filter((x) => x.severity === s).length] as const)
  const shown = showAll ? signals : signals.slice(0, PREVIEW_CARDS)
  return (
    <section>
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        {TYPE_LABEL[type] ?? type}
        <span className="text-xs font-normal text-slate-500">
          {signals.length} signal{signals.length === 1 ? '' : 's'}
          {signals.length > 1 &&
            ` · ${counts
              .filter(([, n]) => n)
              .map(([s, n]) => `${n} ${s.toLowerCase()}`)
              .join(', ')}`}
        </span>
        <SourceTag className="ml-auto">{signalSource(type)}</SourceTag>
      </h3>
      <ul className="space-y-2">
        {shown.map((s) => (
          <SignalCard
            key={s.id}
            signal={s}
            otherStatus={(() => {
              const usdot = otherUsdot(s)
              return usdot === null ? null : statusOf(usdot)
            })()}
            onOpen={() => onOpen(s)}
          />
        ))}
      </ul>
      {!showAll && signals.length > PREVIEW_CARDS && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-slate-600 underline hover:text-slate-900"
        >
          Show all {signals.length}
        </button>
      )}
    </section>
  )
}

export function IntelligenceSection({ usdotNumber }: { usdotNumber: number }) {
  const { data, error, isPending } = useCarrierSignals(usdotNumber)
  // Linked carriers' census status, for the active / not active label on shared-contact signals.
  const network = useCarrierNetwork(usdotNumber)
  const statusOf = useCallback(
    (usdot: number) =>
      network.data?.linked_carriers.find((c) => c.usdot_number === usdot)?.status ?? null,
    [network.data],
  )
  const [includeInfo, setIncludeInfo] = useState(false)
  const [type, setType] = useState<string | null>(null)
  const [status, setStatus] = useState<ReviewStatus | 'ALL'>('OPEN')
  // The open signal lives in the URL (?signal=12), so timeline and relationship links can open
  // it and a link to it can be shared.
  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('signal')) || null
  const setOpenId = useCallback(
    (id: number | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (id === null) next.delete('signal')
          else next.set('signal', String(id))
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const close = useCallback(() => setOpenId(null), [setOpenId])

  const signals = useMemo(() => data?.signals ?? [], [data])
  const openSignals = signals.filter((s) => s.status === 'OPEN')
  const statusCount = (st: ReviewStatus | 'ALL') =>
    st === 'ALL' ? signals.length : signals.filter((s) => s.status === st).length
  const visible = signals.filter(
    (s) =>
      (includeInfo || s.severity !== 'INFO') &&
      (type === null || s.signal_type === type) &&
      (status === 'ALL' || s.status === status),
  )
  const groups = [...TYPE_ORDER, ...new Set(signals.map((s) => s.signal_type))]
    .filter((t, i, all) => all.indexOf(t) === i)
    .map((t) => [t, visible.filter((s) => s.signal_type === t)] as const)
    .filter(([, list]) => list.length > 0)
  const types = [...new Set(signals.map((s) => s.signal_type))].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number]) -
      TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number]),
  )
  const open = signals.find((s) => s.id === openId) ?? null
  const infoCount = signals.filter((s) => s.severity === 'INFO').length

  return (
    <Section id="intelligence" title="Intelligence" source={SOURCES.signals}>
      {isPending && <p className="text-sm text-slate-500">Loading review signals…</p>}
      {error && <p className="text-sm text-red-700">Could not load signals: {error.message}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SEVERITIES.map((s) => (
              <Stat
                key={s}
                label={s === 'INFO' ? 'Information' : `${s.toLowerCase()} severity`}
                value={openSignals.filter((x) => x.severity === s).length}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Open signals by severity
            {signals.length > openSignals.length &&
              ` (${statusCount('REVIEWED')} reviewed, ${statusCount('DISMISSED')} dismissed)`}
            . Signals are deterministic checks over public FMCSA and NHTSA records, each with the
            records behind it. They are prompts for review, not findings about the carrier.
          </p>

          {signals.length === 0 ? (
            <div className="mt-4">
              <Empty>No review signals for this carrier, based on available public records.</Empty>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {STATUSES.map(([st, label]) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={status === st}
                    onClick={() => setStatus(st)}
                    className={chipClass(status === st)}
                  >
                    {label} ({statusCount(st)})
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[null, ...types].map((t) => (
                  <button
                    key={t ?? 'all'}
                    type="button"
                    aria-pressed={type === t}
                    onClick={() => setType(t)}
                    className={chipClass(type === t)}
                  >
                    {t === null ? 'All types' : (TYPE_LABEL[t] ?? t)}
                  </button>
                ))}
                {infoCount > 0 && (
                  <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={includeInfo}
                      onChange={(e) => setIncludeInfo(e.target.checked)}
                    />
                    Show information ({infoCount})
                  </label>
                )}
              </div>

              <div className="mt-4 space-y-6">
                {groups.length === 0 ? (
                  <Empty>
                    {status === 'OPEN' && openSignals.length === 0
                      ? 'No open signals: every signal has been reviewed or dismissed.'
                      : 'No signals match these filters.'}
                    {!includeInfo && infoCount > 0 && ' Information-level signals are hidden.'}
                  </Empty>
                ) : (
                  groups.map(([t, list]) => (
                    <SignalGroup
                      key={`${t}-${type}-${includeInfo}-${status}`}
                      type={t}
                      signals={list}
                      statusOf={statusOf}
                      onOpen={(s) => setOpenId(s.id)}
                    />
                  ))
                )}
              </div>
            </>
          )}
          <RelationshipView usdotNumber={usdotNumber} signals={signals} onOpenSignal={setOpenId} />
          {open && <EvidenceDrawer usdotNumber={usdotNumber} signal={open} onClose={close} />}
        </>
      )}
    </Section>
  )
}
