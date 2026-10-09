import { useState } from 'react'

import { useReviewSignal } from '../../../hooks/useReviewSignal'
import type { ReviewStatus, Signal } from '../../../types/carrierSignals'
import { formatDateTime } from '../../../utils/format'

const MAX_NOTE = 2000

/** A reviewer's decision on one signal. It is kept when the carrier refreshes. */
export function ReviewForm({ usdotNumber, signal }: { usdotNumber: number; signal: Signal }) {
  const [note, setNote] = useState(signal.review_note ?? '')
  const review = useReviewSignal(usdotNumber)
  const decide = (status: ReviewStatus) =>
    review.mutate({ id: signal.id, status, note: status === 'OPEN' ? null : note })

  const button =
    'rounded-md px-3 py-1.5 text-sm ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        {signal.status === 'OPEN' ? (
          'Open: not reviewed yet.'
        ) : (
          <>
            {signal.status === 'REVIEWED' ? 'Reviewed' : 'Dismissed'}{' '}
            {formatDateTime(signal.reviewed_at)}.
          </>
        )}
      </p>
      <div>
        <label htmlFor={`note-${signal.id}`} className="text-xs text-slate-500">
          Note (optional), e.g. what was checked
        </label>
        <textarea
          id={`note-${signal.id}`}
          value={note}
          maxLength={MAX_NOTE}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={review.isPending}
          onClick={() => decide('REVIEWED')}
          className={`${button} bg-accent text-white ring-accent hover:bg-accent-strong`}
        >
          {signal.status === 'REVIEWED' ? 'Save note' : 'Mark reviewed'}
        </button>
        <button
          type="button"
          disabled={review.isPending}
          onClick={() => decide('DISMISSED')}
          className={`${button} bg-surface text-slate-900 ring-slate-300 hover:bg-slate-50`}
        >
          {signal.status === 'DISMISSED' ? 'Save note' : 'Dismiss'}
        </button>
        {signal.status !== 'OPEN' && (
          <button
            type="button"
            disabled={review.isPending}
            onClick={() => {
              setNote('')
              decide('OPEN')
            }}
            className={`${button} bg-surface text-slate-700 ring-slate-300 hover:bg-slate-50`}
          >
            Reopen
          </button>
        )}
      </div>
      {review.isError && (
        <p className="text-sm text-red-700" role="alert">
          Could not save: {review.error.message}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Dismiss when the signal doesn’t apply (for example a known lease). The decision stays on
        record and is kept when the carrier’s data refreshes.
      </p>
    </div>
  )
}
