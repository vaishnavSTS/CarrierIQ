import { useEffect, useState } from 'react'

import { useMarkDataQsOtpUsed, useRequestDataQsOtp } from '../../../hooks/useDataQs'
import type { DataQsCase } from '../../../types/dataqs'
import { formatDateTime } from '../../../utils/format'
import { DataQsOtpChoiceDialog } from '../DataQsOtpChoiceDialog'
import { otpChoiceText } from '../labels'
import { primaryButton, secondaryButton } from '../ui'

/** Seconds until `iso`, ticking every second (0 once passed). */
function useSecondsLeft(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [iso])
  return iso ? Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000)) : 0
}

const STATUS_TEXT = {
  SENT: 'Waiting for the carrier to send the code…',
  RECEIVED: 'Code received.',
  USED: 'Marked used; the code was wiped.',
  EXPIRED: 'Expired; the code (if any) was wiped.',
  FAILED: 'The text or call could not be sent.',
} as const

/**
 * STS: get the carrier's FMCSA login code the way they chose. Start the FMCSA login first, then
 * text or call; the code shows here only for the staff member who asked, for 10 minutes.
 */
export function DataQsOtpStaffPanel({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [editing, setEditing] = useState(false)
  const ask = useRequestDataQsOtp(c.id)
  const used = useMarkDataQsOtpUsed(c.id)
  const choice = c.otp_preference
  const r = c.otp_request
  const left = useSecondsLeft(r?.expires_at ?? null)
  const automated = choice && choice.method !== 'SCHEDULED_CALL'
  const showCode = r?.status === 'RECEIVED' && r.code && left > 0

  return (
    <div className="space-y-3 text-sm">
      {choice ? (
        <p className="text-slate-700">
          The carrier chose: <span className="font-medium">{otpChoiceText(choice)}</span>.
        </p>
      ) : (
        <p className="text-slate-600">The carrier hasn’t chosen how to share the code yet.</p>
      )}

      {choice?.method === 'SCHEDULED_CALL' && (
        <p className="text-slate-600">
          It’s on the open tasks, due at that time. Start the FMCSA login when you call.
        </p>
      )}

      {automated && (
        <>
          <p className="text-slate-600">
            Start the FMCSA login first, so the code FMCSA sends is fresh, then:
          </p>
          <button
            type="button"
            disabled={!c.otp_automation_ready || ask.isPending}
            onClick={() => ask.mutate()}
            className={primaryButton}
          >
            {ask.isPending
              ? 'Sending…'
              : choice.method === 'TEXT'
                ? `Text ${choice.phone} for the code`
                : `Call ${choice.phone} for the code`}
          </button>
          {!c.otp_automation_ready && (
            <p className="text-amber-800">
              Texts and automated calls aren’t set up yet (Twilio). Call the carrier yourself for
              now.
            </p>
          )}
        </>
      )}
      {ask.isError && (
        <p className="text-red-700" role="alert">
          {ask.error.message}
        </p>
      )}

      {r && (
        <div className="rounded-lg border border-slate-200 p-3" aria-live="polite">
          <p className="text-slate-700">
            {r.method === 'TEXT' ? 'Text' : 'Call'} to {r.phone}
            {r.sent_at && ` · ${formatDateTime(r.sent_at)}`}
            {r.requested_by_name && ` · asked by ${r.requested_by_name}`}
          </p>
          <p className="mt-1 font-medium text-slate-900">{STATUS_TEXT[r.status]}</p>
          {r.status === 'FAILED' && r.error && <p className="mt-1 text-red-700">{r.error}</p>}
          {r.status === 'SENT' && left > 0 && (
            <p className="mt-1 text-xs text-slate-600">
              Stops waiting in {Math.ceil(left / 60)} min.
            </p>
          )}
          {showCode && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xl tracking-widest text-slate-950">
                {r.code}
              </span>
              <span className="text-xs text-slate-600">
                Wiped in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </span>
            </div>
          )}
          {r.status === 'RECEIVED' && !r.requested_by_me && (
            <p className="mt-1 text-xs text-slate-600">
              Only {r.requested_by_name ?? 'the staff member who asked'} can see the code.
            </p>
          )}
          {(r.status === 'SENT' || r.status === 'RECEIVED') && r.requested_by_me && (
            <button
              type="button"
              disabled={used.isPending}
              onClick={() => used.mutate(r.id)}
              className={`${secondaryButton} mt-2`}
            >
              {r.status === 'RECEIVED' ? 'Done: wipe the code' : 'Stop waiting'}
            </button>
          )}
        </div>
      )}

      {c.can_set_otp_preference && (
        <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
          {choice ? 'Change the carrier’s choice' : 'Record the carrier’s choice'}
        </button>
      )}
      {editing && <DataQsOtpChoiceDialog dataqsCase={c} onClose={() => setEditing(false)} />}
    </div>
  )
}
