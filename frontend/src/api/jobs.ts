import type { Job, JobsOverview, RefreshQueued } from '../types/jobs'
import { apiGet, apiRequest } from './client'

export function fetchJobs(limit = 15): Promise<JobsOverview> {
  return apiGet<JobsOverview>(`/jobs?limit=${limit}`)
}

export function fetchJob(jobId: number): Promise<Job> {
  return apiGet<Job>(`/jobs/${jobId}`)
}

export function queueCarrierRefresh(usdotNumber: number): Promise<RefreshQueued> {
  return apiRequest<RefreshQueued>(`/carriers/${usdotNumber}/refresh`, { method: 'POST' })
}
