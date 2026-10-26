import { MessageSquareText, CalendarClock, UserCheck, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { useMe } from '../../hooks/useAuth'
import { useSetDataQsOtpPreference } from '../../hooks/useDataQs'
import type { DataQsCase, DataQsOtpMethod } from '../../types/dataqs'
import { inputClass, labelClass } from './intake/intakeState'
import { primaryButton, secondaryButton } from './ui'

const OPTIONS: { method: DataQsOtpMethod; icon: ReactNode; title: string; body: string }[] = [
  {
    method: 'TEXT',
    icon: <MessageSquareText className="size-5" aria-hidden />,
    title: 'Text message',
    body: 'STS texts you when FMCSA sends the code. Reply to that text with the code.',
  },
  // The automated call (AI_CALL) is not offered for now; the backend still accepts it.
  {
    method: 'SCHEDULED_CALL',
    icon: <CalendarClock className="size-5" aria-hidden />,
    title: 'A call at a time you choose',
    body: 'Pick a time. An STS specialist calls you within 5 minutes of it to get the code.',
  },
  {
    method: 'AUTHORIZED_AGENT',
    icon: <UserCheck className="size-5" aria-hidden />,
    title: 'Authorize STS as an agent',
    body: 'STS requests access to your company in the FMCSA Portal and you approve it once. After that STS files with its own login, so no codes are needed.',
  },
]

/** "2026-10-27T14:30" for a datetime-local input, in the browser's time zone. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatPhone(digits: string | null | undefined): string {
  const d = (digits ?? '').replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ''
}

/**
 * After a request is submitted: how the carrier wants to give STS the one-time login code FMCSA
 * sends when STS logs in to file it. Only the choice and phone number are saved; the code itself
 * goes from the carrier to STS when it's needed.
 */
export function DataQsOtpChoiceDialog({
  dataqsCase: c,
  onClose,
}: {
  dataqsCase: DataQsCase
  onClose: () => void
}) {
  const { data: me } = useMe()
  const current = c.otp_preference
  const [method, setMethod] = useState<DataQsOtpMethod | null>(current?.method ?? null)
  const [phone, setPhone] = useState(current?.phone ?? formatPhone(me?.phone))
  const [callAt, setCallAt] = useState(
    current?.call_at ? localInputValue(new Date(current.call_at)) : '',
  )
  const save = useSetDataQsOtpPreference(c.id)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = (event: FormEvent) => {
    event.preventDefault()
    if (!method) return
    save.mutate(
      {
        method,
        phone: phone.trim(),
        call_at: method === 'SCHEDULED_CALL' && callAt ? new Date(callAt).toISOString() : null,
      },
      { onSuccess: onClose },
    )
  }

  const ready =
    method !== null && phone.trim().length >= 10 && (method !== 'SCHEDULED_CALL' || callAt !== '')

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={send}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="otp-title" className="text-lg font-semibold text-slate-950">
              How should STS sign in to FMCSA to file?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              STS can request access to your company in the FMCSA Portal (you approve it once), or
              log in and get the one-time code FMCSA sends you. STS will never ask for your
              password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">How to share the code</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.method}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                method === o.method
                  ? 'border-accent bg-accent-soft'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="otp-method"
                value={o.method}
                checked={method === o.method}
                onChange={() => setMethod(o.method)}
                className="mt-1"
              />
              <span className="mt-0.5 text-accent-strong">{o.icon}</span>
              <span>
                <span className="block text-sm font-medium text-slate-900">{o.title}</span>
                <span className="block text-sm text-slate-600">{o.body}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="otp-phone" className={labelClass}>
              Mobile number
            </label>
            <input
              id="otp-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              maxLength={30}
              placeholder="(209) 555-0123"
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          {method === 'SCHEDULED_CALL' && (
            <div>
              <label htmlFor="otp-call-at" className={labelClass}>
                Call me at
              </label>
              <input
                id="otp-call-at"
                type="datetime-local"
                value={callAt}
                min={localInputValue(new Date())}
                onChange={(e) => setCallAt(e.target.value)}
                aria-describedby="otp-call-at-zone"
                className={inputClass}
              />
              <p id="otp-call-at-zone" className="mt-1 text-xs text-slate-600">
                Your time zone ({timeZone}). STS calls within 5 minutes of this time.
              </p>
            </div>
          )}
        </div>

        {save.isError && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            Could not save: {save.error.message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            {current ? 'Cancel' : 'Decide later'}
          </button>
          <button type="submit" disabled={!ready || save.isPending} className={primaryButton}>
            {save.isPending ? 'Saving…' : 'Save my choice'}
          </button>
        </div>
      </form>
    </div>
  )
}
