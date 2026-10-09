import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { fetchJob, fetchJobs, queueCarrierRefresh } from '../api/jobs'

const DONE = new Set(['SUCCEEDED', 'FAILED'])

/** Job counts, worker status and recent jobs, kept current while the page is open. */
export function useJobs(enabled = true) {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => fetchJobs(),
    refetchInterval: 5_000,
    enabled,
  })
}

/** One job, polled until it finishes. */
export function useJob(jobId: number | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId as number),
    enabled: jobId !== null,
    refetchInterval: (query) => (DONE.has(query.state.data?.status ?? '') ? false : 3_000),
  })
}

/** Ask the worker to refresh a carrier; when the job succeeds, reload the carrier's data. */
export function useCarrierRefresh(usdotNumber: number) {
  const queryClient = useQueryClient()
  const request = useMutation({ mutationFn: () => queueCarrierRefresh(usdotNumber) })
  const job = useJob(request.data?.job?.id ?? null)
  const finished = job.data?.status === 'SUCCEEDED'

  useEffect(() => {
    if (!finished) return
    for (const key of [
      'carrier-profile',
      'carrier-safety',
      'carrier-inspections',
      'carrier-authority',
      'carrier-equipment',
      'carrier-signals',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key, usdotNumber] })
    }
  }, [finished, queryClient, usdotNumber])

  return { request, job: job.data ?? request.data?.job ?? null }
}
