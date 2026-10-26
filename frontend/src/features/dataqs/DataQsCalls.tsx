import { CalendarPlus, Download, Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { dataQsCallCalendarUrl } from '../../api/dataqs'
import { StatusBadge } from '../../components/StatusBadge'
import { useMe } from '../../hooks/useAuth'
import { useBookDataQsCall, useDataQsBase, useSettleDataQsCall } from '../../hooks/useDataQs'
import { usePortalMode } from '../../hooks/usePortalMode'
import type { DataQsCall, DataQsCase } from '../../types/dataqs'
import { formatPhone } from '../../utils/format'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton, secondaryButton } from './ui'

const STATUS = {
  BOOKED: { label: 'Booked', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  DONE: { label: 'Held', tone: 'neutral' },
} as const

/** e.g. "Tue, Oct 27, 2:30 PM CDT", in the time zone it was booked in. */
function callTime(call: DataQsCall): string {
  return new Date(call.starts_at).toLocaleString('en-US', {
    timeZone: call.time_zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/** "2026-10-27T14:30" for a datetime-local input, in the browser's time zone. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const usPhone = (e164: string) => formatPhone(e164.replace(/^\+1/, ''))

/**
 * A call with the STS specialist about the case (not the FMCSA login code). The carrier books a
 * time; they get an email with a calendar file and an "Add to Google Calendar" button, a text now
 * and a text 1 hour before. STS sees the call, the carrier's number, and marks it held.
 */
export function DataQsCalls({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const staff = usePortalMode() === 'internal'
  const booked = c.calls.find((call) => call.status === 'BOOKED')
  const past = c.calls.filter((call) => call !== booked)
  const [moving, setMoving] = useState(false)
  return (
    <div className="space-y-4 text-sm">
      {booked ? (
        <BookedCall
          caseId={c.id}
          call={booked}
          staff={staff}
          canChange={c.can_book_call}
          onMove={() => setMoving((m) => !m)}
          moving={moving}
        />
      ) : (
        c.can_book_call && (
          <p className="text-slate-700">
            {staff
              ? 'Book a call for the carrier. They’re emailed the time with a calendar file, and texted now and 1 hour before.'
              : 'Questions about your request or the evidence? Pick a time and your STS specialist will call you. You’ll get an email with a calendar file, and a text now and 1 hour before the call.'}
          </p>
        )
      )}
      {c.can_book_call && (!booked || moving) && (
        <BookForm caseId={c.id} call={booked} onDone={() => setMoving(false)} />
      )}
      {past.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {past.map((call) => (
            <li key={call.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-slate-900">{callTime(call)}</span>
              <StatusBadge {...STATUS[call.status]} />
              {call.topic && <span className="text-xs text-slate-600">{call.topic}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BookedCall({
  caseId,
  call,
  staff,
  canChange,
  moving,
  onMove,
}: {
  caseId: number
  call: DataQsCall
  staff: boolean
  canChange: boolean
  moving: boolean
  onMove: () => void
}) {
  const base = useDataQsBase()
  const settle = useSettleDataQsCall(caseId)
  return (
    <div className="space-y-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-slate-900">{callTime(call)}</span>
        <StatusBadge {...STATUS.BOOKED} />
      </div>
      <p className="text-slate-700">
        {staff ? 'Call the carrier at ' : 'Your STS specialist calls you at '}
        <a href={`tel:${call.phone}`} className="font-medium text-accent-strong hover:underline">
          <Phone className="mr-1 inline size-3.5" aria-hidden />
          {usPhone(call.phone)}
        </a>{' '}
        · about {call.duration_minutes} minutes
        {call.booked_by_name && staff && ` · booked by ${call.booked_by_name}`}
      </p>
      {call.topic && <p className="text-slate-700">Topic: {call.topic}</p>}
      <div className="flex flex-wrap gap-2">
        <a
          href={call.google_calendar_url}
          target="_blank"
          rel="noreferrer"
          className={`${secondaryButton} inline-flex items-center gap-1.5`}
        >
          <CalendarPlus className="size-4" aria-hidden />
          Add to Google Calendar
        </a>
        <a
          href={dataQsCallCalendarUrl(base, caseId, call.id)}
          className={`${secondaryButton} inline-flex items-center gap-1.5`}
        >
          <Download className="size-4" aria-hidden />
          Calendar file (Outlook, Apple)
        </a>
        {canChange && (
          <>
            <button type="button" className={secondaryButton} onClick={onMove}>
              {moving ? 'Keep this time' : 'Move the call'}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={settle.isPending}
              onClick={() => settle.mutate({ callId: call.id, action: 'cancel' })}
            >
              Cancel the call
            </button>
          </>
        )}
        {staff && (
          <button
            type="button"
            className={primaryButton}
            disabled={settle.isPending}
            onClick={() => settle.mutate({ callId: call.id, action: 'done' })}
          >
            Mark the call held
          </button>
        )}
      </div>
      {settle.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {settle.error.message}
        </p>
      )}
    </div>
  )
}

function BookForm({
  caseId,
  call,
  onDone,
}: {
  caseId: number
  call: DataQsCall | undefined
  onDone: () => void
}) {
  const { data: me } = useMe()
  const staff = usePortalMode() === 'internal'
  const [when, setWhen] = useState('')
  const [phone, setPhone] = useState(
    call ? usPhone(call.phone) : !staff && me?.phone ? formatPhone(me.phone) : '',
  )
  const [topic, setTopic] = useState(call?.topic ?? '')
  const book = useBookDataQsCall(caseId)
  const earliest = localInput(new Date(Date.now() + 30 * 60 * 1000))
  const latest = localInput(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))
  const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    book.mutate(
      {
        starts_at: new Date(when).toISOString(),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        phone,
        topic: topic.trim() || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`call-at-${caseId}`} className={labelClass}>
            {call ? 'New time' : 'Time'} (your local time)
          </label>
          <input
            id={`call-at-${caseId}`}
            type="datetime-local"
            value={when}
            min={earliest}
            max={latest}
            onChange={(e) => setWhen(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`call-phone-${caseId}`} className={labelClass}>
            Phone number to call
          </label>
          <input
            id={`call-phone-${caseId}`}
            type="tel"
            autoComplete="tel"
            value={phone}
            maxLength={30}
            placeholder="(555) 010-2030"
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`call-topic-${caseId}`} className={labelClass}>
          What would you like to talk about? (optional)
        </label>
        <textarea
          id={`call-topic-${caseId}`}
          rows={2}
          value={topic}
          maxLength={1000}
          onChange={(e) => setTopic(e.target.value)}
          className={inputClass}
        />
      </div>
      {book.isError && (
        <p className="text-red-700" role="alert">
          Could not book it: {book.error.message}
        </p>
      )}
      <button
        type="submit"
        className={primaryButton}
        disabled={!when || digits.length !== 10 || book.isPending}
      >
        {book.isPending ? 'Booking…' : call ? 'Move the call' : 'Book the call'}
      </button>
    </form>
  )
}
