import { useState } from 'react'

import { useAddIdentityEvent } from '../../../hooks/useNetwork'
import type { IdentityEvent, IdentityEventType } from '../../../types/network'
import { formatDate } from '../../../utils/format'

const EVENT_LABEL: Record<IdentityEventType, string> = {
  OWNERSHIP_CHANGE_ATTESTED: 'Ownership change attested',
  ATTESTATION_CORRECTED: 'Attestation corrected',
  PLATFORM_ALERT: 'Flagged on a platform',
  OWNERSHIP_VERIFIED: 'Ownership verified from documents',
  NOTE: 'Note',
}

const field = 'mt-1 w-full rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Optional: what the team knows that no public source publishes (e.g. a Highway ownership
 * attestation). Events are never edited or deleted; a correction is a new event.
 */
export function TeamNotes({
  usdotNumber,
  events,
}: {
  usdotNumber: number
  events: IdentityEvent[]
}) {
  const add = useAddIdentityEvent(usdotNumber)
  const [type, setType] = useState<IdentityEventType>('NOTE')
  const [date, setDate] = useState(today())
  const [platform, setPlatform] = useState('')
  const [description, setDescription] = useState('')
  const [document, setDocument] = useState('')
  const [corrects, setCorrects] = useState<number | ''>('')
  const [enteredBy, setEnteredBy] = useState('')
  const attestations = events.filter((e) => e.event_type === 'OWNERSHIP_CHANGE_ATTESTED')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    add.mutate(
      {
        event_type: type,
        event_date: date,
        platform: platform || null,
        description,
        supporting_document: document || null,
        corrects_event_id: type === 'ATTESTATION_CORRECTED' && corrects !== '' ? corrects : null,
        entered_by: enteredBy || null,
      },
      {
        onSuccess: () => {
          setDescription('')
          setDocument('')
          setCorrects('')
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">No notes recorded.</p>
      ) : (
        <ol className="space-y-2">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {EVENT_LABEL[e.event_type]}
                  {e.platform && ` on ${e.platform}`}
                </span>
                <span className="text-xs text-slate-500">{formatDate(e.event_date)}</span>
              </div>
              {e.description && <p className="mt-1 text-slate-700">{e.description}</p>}
              <p className="mt-1 text-xs text-slate-500">
                {[
                  e.supporting_document && `Document: ${e.supporting_document}`,
                  e.corrects_event_id && 'Corrects an earlier attestation',
                  e.corrected_by.length > 0 && 'Later corrected',
                  e.entered_by && `Entered by ${e.entered_by}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      )}

      <details className="rounded-md border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Add a note or ownership event
        </summary>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Type
            <select
              id="note-type"
              value={type}
              onChange={(e) => setType(e.target.value as IdentityEventType)}
              className={field}
            >
              {Object.entries(EVENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Date
            <input
              id="note-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className={field}
              required
            />
          </label>
          <label className="text-xs text-slate-500">
            Platform (optional)
            <input
              id="note-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. Highway"
              maxLength={100}
              className={field}
            />
          </label>
          {type === 'ATTESTATION_CORRECTED' ? (
            <label className="text-xs text-slate-500">
              Corrects
              <select
                id="note-corrects"
                value={corrects}
                onChange={(e) => setCorrects(e.target.value ? Number(e.target.value) : '')}
                className={field}
                required
              >
                <option value="">Choose the attestation…</option>
                {attestations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatDate(a.event_date)}
                    {a.platform && ` on ${a.platform}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs text-slate-500">
              Entered by (optional)
              <input
                id="note-by"
                value={enteredBy}
                onChange={(e) => setEnteredBy(e.target.value)}
                maxLength={255}
                className={field}
              />
            </label>
          )}
          <label className="text-xs text-slate-500 sm:col-span-2">
            What happened
            <textarea
              id="note-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className={field}
              required
            />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Supporting document (optional): where the proof is kept
            <input
              id="note-document"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              maxLength={500}
              placeholder="e.g. CA Secretary of State filing, shared drive › Ajohar › 2026"
              className={field}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={add.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong disabled:opacity-50"
            >
              Save
            </button>
            <span className="text-xs text-slate-500">
              Saved notes can’t be edited or deleted; add a new one to correct them.
            </span>
          </div>
          {add.isError && (
            <p className="text-sm text-red-700 sm:col-span-2" role="alert">
              Could not save: {add.error.message}
            </p>
          )}
        </form>
      </details>
    </div>
  )
}
