import { type ReactNode, useEffect, useRef } from 'react'

import { motion } from 'motion/react'

import { StatusBadge } from '../../../components/StatusBadge'
import type { Signal } from '../../../types/carrierSignals'
import { formatDate, formatDateTime } from '../../../utils/format'
import { severityTone } from '../../../utils/status'
import {
  CONFIDENCE_EXPLAINED,
  EVIDENCE_TYPE_LABEL,
  RULE_EXPLAINED,
  TYPE_LABEL,
  sourceName,
} from './labels'
import { ReviewForm } from './ReviewForm'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-5 py-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

/** Centered pop-up answering "why was this signal generated?" with every record behind it. */
export function EvidenceDrawer({
  usdotNumber,
  signal,
  onClose,
}: {
  usdotNumber: number
  signal: Signal
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close evidence"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl border border-slate-200 bg-surface shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-surface px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {TYPE_LABEL[signal.signal_type] ?? signal.signal_type}
            </div>
            <h2 id="evidence-title" className="mt-1 text-base font-semibold text-slate-900">
              {signal.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                label={`${signal.severity.toLowerCase()} severity`}
                tone={severityTone(signal.severity)}
              />
              <StatusBadge label={`${signal.confidence.toLowerCase()} confidence`} tone="neutral" />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            Close
          </button>
        </div>

        <Block title="What the records show">
          <p className="text-sm text-slate-700">{signal.description}</p>
        </Block>

        <Block title={`Evidence (${signal.evidence.length})`}>
          <ol className="space-y-2">
            {signal.evidence.map((e, i) => (
              <li key={i} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium uppercase tracking-wide">
                    {EVIDENCE_TYPE_LABEL[e.evidence_type] ?? e.evidence_type}
                  </span>
                  <span>
                    {[e.observed_at && formatDate(e.observed_at.slice(0, 10)), sourceName(e.source)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="mt-1 break-words text-slate-900">{e.observed_value ?? '—'}</div>
                {e.raw_record_id !== null && (
                  <div className="mt-1 text-xs text-slate-500">
                    Stored source record #{e.raw_record_id}
                    {e.entity_type && ` · ${e.entity_type.replace(/_/g, ' ')} #${e.entity_id}`}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Block>

        <Block title="Review">
          <ReviewForm key={signal.id} usdotNumber={usdotNumber} signal={signal} />
        </Block>

        <Block title="How this was calculated">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Rule</dt>
              <dd className="text-slate-900">
                {RULE_EXPLAINED[signal.rule_id] ?? signal.rule_id}{' '}
                <span className="font-mono text-xs text-slate-500">
                  ({signal.rule_id} v{signal.rule_version})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Confidence: {signal.confidence.toLowerCase()}</dt>
              <dd className="text-slate-900">{CONFIDENCE_EXPLAINED[signal.confidence]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Detected</dt>
              <dd className="text-slate-900">
                First {formatDateTime(signal.first_detected_at)}; last confirmed{' '}
                {formatDateTime(signal.last_detected_at)}
              </dd>
            </div>
          </dl>
        </Block>

        <p className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
          Based on available public records. A signal is a prompt for review, not a finding about
          the carrier.
        </p>
      </motion.div>
    </div>
  )
}
