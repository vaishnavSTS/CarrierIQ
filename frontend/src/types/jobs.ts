/** Mirrors backend/app/schemas/jobs.py */

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface Job {
  id: number
  /** refresh_carrier | rebuild_signals */
  job_type: string
  payload: { usdot_number?: number; force?: boolean }
  status: JobStatus
  attempts: number
  max_attempts: number
  /** For a QUEUED retry: when it will run */
  run_after: string
  locked_by: string | null
  last_error: string | null
  result: Record<string, unknown> | null
  created_at: string
  finished_at: string | null
}

export interface JobsOverview {
  counts: Record<JobStatus, number>
  /** A worker checked in recently */
  worker_running: boolean
  workers: { worker: string; started_at: string; last_seen_at: string }[]
  /** Newest first */
  jobs: Job[]
}

export interface RefreshQueued {
  /** false: a refresh for this carrier was already waiting or running */
  queued: boolean
  job: Job | null
}
