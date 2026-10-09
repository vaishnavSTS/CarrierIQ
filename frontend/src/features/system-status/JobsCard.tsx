import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useJobs } from '../../hooks/useJobs'
import type { Job, JobStatus } from '../../types/jobs'
import { formatDateTime } from '../../utils/format'
import type { Tone } from '../../utils/status'

const STATUSES: JobStatus[] = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']

const STATUS_TONE: Record<JobStatus, Tone> = {
  QUEUED: 'pending',
  RUNNING: 'warn',
  SUCCEEDED: 'ok',
  FAILED: 'down',
}

const TYPE_LABEL: Record<string, string> = {
  refresh_carrier: 'Refresh',
  rebuild_signals: 'Rebuild signals',
}

function JobRow({ job }: { job: Job }) {
  const usdot = job.payload.usdot_number
  return (
    <tr className="align-top">
      <td className="py-1.5 pr-3">
        {TYPE_LABEL[job.job_type] ?? job.job_type}{' '}
        {usdot !== undefined && (
          <Link to={`/carriers/${usdot}`} className="font-mono text-xs underline">
            {usdot}
          </Link>
        )}
      </td>
      <td className="py-1.5 pr-3">
        <StatusBadge label={job.status.toLowerCase()} tone={STATUS_TONE[job.status]} />
        {job.attempts > 1 && (
          <span className="ml-1 text-xs text-slate-500">
            {job.attempts}/{job.max_attempts} tries
          </span>
        )}
        {job.last_error && job.status !== 'SUCCEEDED' && (
          <div className="mt-0.5 max-w-xs truncate text-xs text-red-700" title={job.last_error}>
            {job.last_error}
          </div>
        )}
      </td>
      <td className="whitespace-nowrap py-1.5 text-right text-xs text-slate-500">
        {formatDateTime(job.finished_at ?? job.created_at)}
      </td>
    </tr>
  )
}

/** Background worker status and recent jobs (spec Phase 10, "job status"). */
export function JobsCard() {
  const { data, isPending, isError } = useJobs()

  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Background jobs</h2>
        {data && (
          <StatusBadge
            label={data.worker_running ? 'worker running' : 'no worker running'}
            tone={data.worker_running ? 'ok' : 'neutral'}
          />
        )}
      </div>
      {isPending && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
      {isError && <p className="mt-2 text-sm text-red-700">Could not load job status.</p>}
      {data && (
        <>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {STATUSES.map((s) => (
              <div key={s} className="rounded-md border border-slate-200 px-2 py-1.5">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  {s.toLowerCase()}
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">
                  {data.counts[s] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          {!data.worker_running && (
            <p className="mt-3 text-xs text-slate-500">
              Queued refreshes run once a worker is started:{' '}
              <span className="font-mono">python -m app.workers.worker</span> (or the Docker{' '}
              <span className="font-mono">worker</span> service). Carriers still refresh when
              opened.
            </p>
          )}
          {data.jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No jobs yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.jobs.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
