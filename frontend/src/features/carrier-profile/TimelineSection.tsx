import { useState } from 'react'
import { Link } from 'react-router-dom'

import { SourceTag } from '../../components/SourceTag'
import { StatusBadge } from '../../components/StatusBadge'
import type { Change, TimelineEvent } from '../../types/carrierProfile'
import { formatDate, humanize } from '../../utils/format'
import { eventSource } from '../../utils/sources'
import { severityTone } from '../../utils/status'
import { Empty, Section } from './Section'

interface Row {
  key: string
  date: string
  severity: TimelineEvent['severity']
  title: string
  description: string | null
  signalId: number | null
  source: string
}

const PREVIEW_ROWS = 25

function fromChange(c: Change): Row {
  return {
    key: `change-${c.attribute}-${c.changed_on}-${c.new_value}`,
    date: c.changed_on,
    severity: 'INFO',
    title: `${humanize(c.attribute)} changed`,
    description: `${c.old_value ?? '(empty)'} → ${c.new_value ?? '(empty)'}`,
    signalId: null,
    source: 'FMCSA Company Census (changes CarrierIQ has seen)',
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
  const [showAll, setShowAll] = useState(false)

  const rows: Row[] = [
    ...events.map((e) => ({
      key: `${e.event_type}-${e.event_date}-${e.title}`,
      date: e.event_date,
      severity: e.severity,
      title: e.title,
      description: e.description,
      signalId: e.signal_id,
      source: eventSource(e.event_type),
    })),
    ...changes.map(fromChange),
  ]
    .filter((r) => !significantOnly || r.severity === 'HIGH' || r.severity === 'MEDIUM')
    .sort((a, b) => b.date.localeCompare(a.date))
  const shown = showAll ? rows : rows.slice(0, PREVIEW_ROWS)

  return (
    <Section
      id="timeline"
      title="Timeline"
      source="FMCSA authority, insurance and census records; your team"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Authority and insurance events from FMCSA records, plus changes CarrierIQ has recorded
          since it first loaded this carrier. Newest first.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={significantOnly}
            onChange={(event) => setSignificantOnly(event.target.checked)}
          />
          Medium and high only
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {significantOnly
            ? 'No medium or high events.'
            : 'No events recorded yet. Changes appear here as FMCSA updates the record.'}
        </Empty>
      ) : (
        <ol className="space-y-3">
          {shown.map((r) => (
            <li key={r.key} className="flex gap-4 text-sm">
              <span className="w-24 shrink-0 whitespace-nowrap text-slate-500">
                {formatDate(r.date)}
              </span>
              <span className="w-20 shrink-0">
                <StatusBadge label={r.severity.toLowerCase()} tone={severityTone(r.severity)} />
              </span>
              <span className="flex-1">
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
                <SourceTag className="block">{r.source}</SourceTag>
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
