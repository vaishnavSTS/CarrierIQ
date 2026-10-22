import { useState, type FormEvent } from 'react'

import { useCloseDataQsFile } from '../../../hooks/useDataQs'
import type { DataQsCase } from '../../../types/dataqs'
import { inputClass, labelClass } from '../intake/intakeState'
import { secondaryButton } from '../ui'

/** STS: close the file. The carrier is emailed that it is closed, with this note. */
export function DataQsCloseFile({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [sure, setSure] = useState(false)
  const close = useCloseDataQsFile(c.id)
  const beforeDecision = c.outcome === null
  // Approved corrections FMCSA's data doesn't show yet: closing anyway needs a reason.
  const unseen = c.issues.filter(
    (i) => i.verification_status !== null && i.verification_status !== 'VERIFIED',
  ).length
  const ready = note.trim().length >= 5 && (unseen === 0 || reason.trim().length >= 5)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    close.mutate({ version: c.row_version, note: note.trim(), reason: reason.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-slate-700">
        Closing ends the open tasks, deadlines and reminders, and emails the carrier that the file
        is closed.
        {beforeDecision && ' There is no agency decision yet, so it will be recorded as withdrawn.'}
      </p>
      <div>
        <label htmlFor="close-note" className={labelClass}>
          Note to the carrier (included in the email)
        </label>
        <textarea
          id="close-note"
          rows={3}
          value={note}
          maxLength={5000}
          placeholder="e.g. FMCSA's record now shows the correction. Thank you for working with STS."
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </div>
      {unseen > 0 && (
        <div>
          <label htmlFor="close-unverified" className={labelClass}>
            FMCSA’s data doesn’t show{' '}
            {unseen === 1 ? 'an approved correction' : `${unseen} approved corrections`} yet. Why
            close anyway? (STS only)
          </label>
          <textarea
            id="close-unverified"
            rows={2}
            value={reason}
            maxLength={2000}
            placeholder="e.g. DPS confirmed by phone; PSP report shows the record corrected."
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
        />
        <span>Close this file and email the carrier.</span>
      </label>
      {close.isError && (
        <p className="text-red-700" role="alert">
          Could not close: {close.error.message}
        </p>
      )}
      <button
        type="submit"
        className={secondaryButton}
        disabled={!sure || !ready || close.isPending}
      >
        {close.isPending ? 'Closing…' : 'File closed'}
      </button>
    </form>
  )
}
