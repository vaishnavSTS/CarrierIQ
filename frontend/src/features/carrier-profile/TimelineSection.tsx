import { useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { Change, TimelineEvent } from '../../types/carrierProfile'
import { formatDate } from '../../utils/format'
import { eventSource } from '../../utils/sources'
import { severityTone } from '../../utils/status'
import { attributeLabel } from './network/attributeLabel'
import { Empty, Section } from './Section'

type Kind = 'authority' | 'insurance' | 'census' | 'team' | 'other'

interface Row {
  key: string
  date: string
  kind: Kind
  /** null for census changes: a change of a fact, not a scored event */
  severity: TimelineEvent['severity'] | null
  title: string
  description: string | null
  signalId: number | null
}

const PREVIEW_ROWS = 25

const KIND_LABEL: Record<Kind, string> = {
  authority: 'Authority',
  insurance: 'Insurance',
  census: 'Census changes',
  team: 'Your team',
  other: 'Other FMCSA records',
}

const CENSUS_SOURCE = 'FMCSA Company Census (changes CarrierSafetyScan has detected)'

/** The event's kind, by its type's prefix (see backend change_detection). */
function kindOf(eventType: string): Kind {
  if (eventType.startsWith('AUTHORITY_')) return 'authority'
  if (eventType.startsWith('INSURANCE_')) return 'insurance'
  if (eventType.startsWith('IDENTITY_')) return 'team'
  return 'other'
}

function fromChange(c: Change): Row {
  return {
    key: `change-${c.attribute}-${c.changed_on}-${c.new_value}`,
    date: c.changed_on,
    kind: 'census',
    severity: null,
    title: `${attributeLabel(c.attribute)} changed`,
    description: `${c.old_value ?? '(empty)'} → ${c.new_value ?? '(empty)'}`,
    signalId: null,
  }
}

export function TimelineSection({
  events,
  changes,
}: {
  events: TimelineEvent[]
  changes: Change[]
}) {
  const [significantOnly, setSignificantOnly] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)
  const [showAll, setShowAll] = useState(false)

  const all: Row[] = [
    ...events.map((e) => ({
      key: `${e.event_type}-${e.event_date}-${e.title}`,
      date: e.event_date,
      kind: kindOf(e.event_type),
      severity: e.severity,
      title: e.title,
      description: e.description,
      signalId: e.signal_id,
    })),
    ...changes.map(fromChange),
  ].sort((a, b) => b.date.localeCompare(a.date))
  // Census changes have no severity, so "medium and high only" keeps them: a new name, email
  // or fleet size is what a reviewer looks for first.
  const rows = all.filter(
    (r) =>
      (kind === null || r.kind === kind) &&
      (!significantOnly || r.severity === null || r.severity === 'HIGH' || r.severity === 'MEDIUM'),
  )
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => all.some((r) => r.kind === k))
  const sources = kinds.map(
    (k) =>
      `${KIND_LABEL[k]}: ${
        k === 'census'
          ? CENSUS_SOURCE
          : eventSource(events.find((e) => kindOf(e.event_type) === k)?.event_type ?? '')
      }`,
  )
  const shown = showAll ? rows : rows.slice(0, PREVIEW_ROWS)

  return (
    <Section
      id="timeline"
      title="Timeline"
      source="FMCSA authority, insurance and census records; your team"
    >
      <div className="mb-3 space-y-2">
        <p className="text-xs text-slate-500">
          Authority and insurance events from FMCSA’s history files, plus census changes
          CarrierSafetyScan has detected between its refreshes of this carrier (changes made before
          it started tracking the carrier are not known). Newest first.
        </p>
        {sources.length > 0 && (
          <p className="text-[11px] text-slate-500">Sources · {sources.join(' · ')}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {[null, ...kinds].map((k) => (
            <button
              key={k ?? 'all'}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k)
                setShowAll(false)
              }}
              className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset ${
                kind === k
                  ? 'bg-accent text-cta-ink ring-accent'
                  : 'bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {k === null ? 'All' : KIND_LABEL[k]} (
              {k === null ? all.length : all.filter((r) => r.kind === k).length})
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={significantOnly}
              onChange={(event) => setSignificantOnly(event.target.checked)}
            />
            Medium and high events only (census changes stay)
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {all.length > 0
            ? 'Nothing matches these filters.'
            : 'No events yet. FMCSA history events and census changes appear here as CarrierSafetyScan detects them.'}
        </Empty>
      ) : (
        <ol className="space-y-3">
          {shown.map((r) => (
            <li
              key={r.key}
              className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_6rem_1fr]"
            >
              <span className="whitespace-nowrap text-slate-500">
                {formatDate(r.date)}
                <span className="block text-[11px]">{KIND_LABEL[r.kind]}</span>
              </span>
              <span>
                {r.severity ? (
                  <StatusBadge label={r.severity.toLowerCase()} tone={severityTone(r.severity)} />
                ) : (
                  <StatusBadge label="change" tone="neutral" />
                )}
              </span>
              <span className="col-span-2 min-w-0 break-words sm:col-span-1">
                <span className="font-medium text-slate-900">{r.title}</span>
                {r.signalId !== null && (
                  <Link
                    to={`?tab=intelligence&signal=${r.signalId}`}
                    className="ml-2 text-xs text-slate-600 underline hover:text-slate-900"
                  >
                    Review signal ›
                  </Link>
                )}
                {r.description && (
                  <span className="block text-xs text-slate-600">{r.description}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!showAll && rows.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs text-slate-600 underline hover:text-slate-900"
        >
          Show all {rows.length}
        </button>
      )}
    </Section>
  )
}
