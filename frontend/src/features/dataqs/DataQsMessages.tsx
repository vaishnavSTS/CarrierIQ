import { useState, type FormEvent } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import { useEmailDataQsCarrier } from '../../hooks/useDataQs'
import type { DataQsCase, DataQsMessage } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton } from './ui'

const DELIVERY = {
  SENT: { label: 'Emailed', tone: 'ok' },
  WAITING: { label: 'Waiting to send', tone: 'pending' },
  FAILED: { label: 'Email failed', tone: 'down' },
  NOT_SENT: { label: 'Not emailed', tone: 'neutral' },
} as const

/** Emails between STS and the carrier about the case, newest first. Staff can write one; the
 * carrier replies by email (the reply goes to the STS inbox). */
export function DataQsMessages({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  return (
    <div className="space-y-4">
      {c.can_message && <Compose dataqsCase={c} />}
      {c.messages.length === 0 ? (
        <p className="text-sm text-slate-500">No messages yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {c.messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </ul>
      )}
    </div>
  )
}

function MessageRow({ message: m }: { message: DataQsMessage }) {
  const delivery = DELIVERY[m.delivery]
  return (
    <li className="space-y-1 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">{m.subject}</span>
        <StatusBadge label={delivery.label} tone={delivery.tone} />
      </div>
      <p className="text-xs text-slate-500">
        {formatDateTime(m.created_at)} · from {m.author_name ? `${m.author_name}, STS` : 'STS'}
        {m.recipients.length > 0 && ` · to ${m.recipients.join(', ')}`}
      </p>
      <p className="whitespace-pre-line text-slate-700">{m.body}</p>
    </li>
  )
}

function Compose({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const send = useEmailDataQsCarrier(c.id)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send.mutate(
      { subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setSubject('')
          setBody('')
        },
      },
    )
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-md bg-slate-50 p-3 text-sm">
      <div>
        <label htmlFor="message-subject" className={labelClass}>
          Email the carrier: subject
        </label>
        <input
          id="message-subject"
          value={subject}
          maxLength={200}
          placeholder="e.g. One more document for your DataQs request"
          onChange={(e) => setSubject(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="message-body" className={labelClass}>
          Message
        </label>
        <textarea
          id="message-body"
          rows={4}
          value={body}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
      </div>
      {!c.email_enabled && (
        <p className="text-xs text-amber-800">
          Email isn’t set up on this server yet: the message is kept on the case and sent once it
          is.
        </p>
      )}
      {send.isError && (
        <p className="text-red-700" role="alert">
          Could not send: {send.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={subject.trim().length < 3 || body.trim().length < 5 || send.isPending}
      >
        {send.isPending ? 'Sending…' : 'Send email'}
      </button>
    </form>
  )
}
