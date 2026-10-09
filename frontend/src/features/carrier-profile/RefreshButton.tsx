import { useCarrierRefresh, useJobs } from '../../hooks/useJobs'
import { formatDateTime } from '../../utils/format'

/** "Refresh now": queue a forced refresh for the background worker and follow it. */
export function RefreshButton({ usdotNumber }: { usdotNumber: number }) {
  const { request, job } = useCarrierRefresh(usdotNumber)
  const waiting = job !== null && (job.status === 'QUEUED' || job.status === 'RUNNING')
  // Only checked once a refresh is waiting, to warn when no worker will pick it up.
  const jobs = useJobs(waiting)

  let message: string | null = null
  if (request.isError) {
    message = `Could not queue the refresh: ${request.error.message}`
  } else if (job?.status === 'RUNNING') {
    message = 'Fetching the latest FMCSA and NHTSA data…'
  } else if (job?.status === 'QUEUED') {
    if (job.attempts > 0) {
      message = `A source failed; retrying ${formatDateTime(job.run_after)} (attempt ${job.attempts + 1} of ${job.max_attempts}).`
    } else if (jobs.data && !jobs.data.worker_running) {
      message = 'Queued, but no background worker is running. Start one to process it.'
    } else {
      message = 'Queued for the background worker…'
    }
  } else if (job?.status === 'SUCCEEDED') {
    message = 'Refreshed. Showing the latest data.'
  } else if (job?.status === 'FAILED') {
    message = `Refresh failed: ${job.last_error ?? 'unknown error'}`
  }
  const failed = job?.status === 'FAILED' || request.isError

  return (
    <div className="mt-2 flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={request.isPending || waiting}
        onClick={() => request.mutate()}
        className="rounded-md px-2.5 py-1 text-xs text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {waiting ? 'Refreshing…' : 'Refresh now'}
      </button>
      {message && (
        <p role="status" className={`max-w-xs text-right ${failed ? 'text-red-700' : ''}`}>
          {message}
        </p>
      )}
    </div>
  )
}
