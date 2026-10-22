import { StatusBadge } from '../../../components/StatusBadge'
import type { DataQsEmail } from '../../../types/dataqs'
import { formatDateTime } from '../../../utils/format'

const KIND: Record<string, string> = {
  MESSAGE: 'Message to the carrier',
  EVIDENCE_NEEDED: 'Evidence needed (carrier)',
  PACKAGE_READY: 'Package ready to approve (carrier)',
  FILED: 'Filed with DataQs (carrier)',
  DECISION: 'Agency decision (carrier)',
  FILE_CLOSED: 'File closed (carrier)',
  CORRECTION_VERIFIED: "Correction seen in FMCSA's data (carrier)",
  REMINDER_7_DAYS: 'Reminder: 7 days since filing (STS)',
  REMINDER_21_DAYS: 'Reminder: 21 days since filing (STS)',
  REMINDER_ANSWER_7_DAYS_LEFT: 'Reminder: answer the agency, 7 days left (STS)',
  REMINDER_ANSWER_3_DAYS_LEFT: 'Reminder: answer the agency, 3 days left (STS)',
  REMINDER_ANSWER_1_DAYS_LEFT: 'Reminder: answer the agency, 1 day left (STS)',
  REMINDER_APPEAL_14_DAYS_LEFT: 'Reminder: appeal deadline, 14 days left (STS)',
  REMINDER_APPEAL_7_DAYS_LEFT: 'Reminder: appeal deadline, 7 days left (STS)',
  REMINDER_APPEAL_3_DAYS_LEFT: 'Reminder: appeal deadline, 3 days left (STS)',
  REMINDER_APPEAL_1_DAYS_LEFT: 'Reminder: appeal deadline, 1 day left (STS)',
}
const STATUS = {
  PENDING: { label: 'Waiting', tone: 'pending' },
  SENT: { label: 'Sent', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'down' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
} as const

/** STS: every email on the case, sent or scheduled, and anything that failed. */
export function DataQsEmailLog({ emails }: { emails: DataQsEmail[] }) {
  if (emails.length === 0) return <p className="text-sm text-slate-500">No emails yet.</p>
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {emails.map((e) => {
        const status = STATUS[e.status]
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="text-slate-900">{KIND[e.kind] ?? e.kind}</span>
            <StatusBadge label={status.label} tone={status.tone} />
            <span className="text-xs text-slate-500">
              {e.to.length > 0 && `to ${e.to.join(', ')} · `}
              {e.sent_at
                ? `sent ${formatDateTime(e.sent_at)}`
                : e.scheduled_for
                  ? `due ${formatDateTime(e.scheduled_for)}`
                  : 'queued'}
              {e.attempts > 1 && ` · ${e.attempts} tries`}
            </span>
            {e.last_error && <span className="w-full text-xs text-red-700">{e.last_error}</span>}
          </li>
        )
      })}
    </ul>
  )
}
