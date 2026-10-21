import { useState, type FormEvent } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import { useOverrideDataQsClock } from '../../hooks/useDataQs'
import type { DataQsCase, DataQsClock } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { inputClass, labelClass } from './intake/intakeState'
import { secondaryButton } from './ui'

function daysText(days: number): string {
  const whole = Math.floor(Math.abs(days))
  if (days < 0) return `${whole} day${whole === 1 ? '' : 's'} overdue`
  if (days < 1) return 'due today'
  return `${whole} day${whole === 1 ? '' : 's'} left`
}

/** Active deadlines: agency review (pauses while the agency waits on information), the answer to
 * an information request, and the appeal window. Calendar days. */
export function DataQsDeadlines({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {c.clocks.map((clock) => (
        <ClockRow key={clock.id} dataqsCase={c} clock={clock} />
      ))}
    </ul>
  )
}

function ClockRow({ dataqsCase: c, clock }: { dataqsCase: DataQsCase; clock: DataQsClock }) {
  const [editing, setEditing] = useState(false)
  const tone = clock.paused
    ? 'pending'
    : clock.days_left < 0
      ? 'down'
      : clock.days_left <= 3
        ? 'warn'
        : 'neutral'
  return (
    <li className="space-y-1 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-slate-900">{clock.label}</span>
        <span>{clock.due_at ? formatDateTime(clock.due_at) : 'paused'}</span>
        <StatusBadge
          label={
            clock.paused
              ? `paused · ${Math.floor(clock.days_left)} days left`
              : daysText(clock.days_left)
          }
          tone={tone}
        />
        {c.can_override_deadlines && (
          <button
            type="button"
            className="text-xs text-accent-strong hover:underline"
            onClick={() => setEditing((e) => !e)}
          >
            Change
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {clock.budget_days} calendar days from {formatDateTime(clock.base_at)}
        {clock.authority_source && ` · ${clock.authority_source}`}
        {clock.override_reason && ` · set by hand: ${clock.override_reason}`}
      </p>
      {editing && <OverrideForm dataqsCase={c} clock={clock} onDone={() => setEditing(false)} />}
    </li>
  )
}

function OverrideForm({
  dataqsCase: c,
  clock,
  onDone,
}: {
  dataqsCase: DataQsCase
  clock: DataQsClock
  onDone: () => void
}) {
  const [dueAt, setDueAt] = useState('')
  const [reason, setReason] = useState('')
  const override = useOverrideDataQsClock(c.id)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    override.mutate(
      {
        clockId: clock.id,
        version: c.row_version,
        dueAt: new Date(dueAt).toISOString(),
        reason: reason.trim(),
      },
      { onSuccess: onDone },
    )
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[12rem_1fr_auto]"
    >
      <div>
        <label htmlFor={`due-${clock.id}`} className={labelClass}>
          New due date
        </label>
        <input
          id={`due-${clock.id}`}
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`reason-${clock.id}`} className={labelClass}>
          Why (e.g. the state counts business days)
        </label>
        <input
          id={`reason-${clock.id}`}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        className={`${secondaryButton} self-end`}
        disabled={!dueAt || reason.trim().length < 5 || override.isPending}
      >
        Save
      </button>
      {override.isError && (
        <p className="text-sm text-red-700 sm:col-span-3" role="alert">
          {override.error.message}
        </p>
      )}
    </form>
  )
}
