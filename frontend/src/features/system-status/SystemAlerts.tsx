import { AlertTriangle, CircleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useHealth } from '../../hooks/useHealth'
import { useJobs } from '../../hooks/useJobs'

/**
 * The "worker isn't running" banner is off for now: the hosted backend runs without a worker
 * (render.yaml, RUN_WORKER_IN_API=false), so it would always show. Set VITE_SHOW_WORKER_ALERT=true
 * (Vercel environment variable, or frontend/.env.local) to show it again once a worker runs.
 */
const SHOW_WORKER_ALERT = import.meta.env.VITE_SHOW_WORKER_ALERT === 'true'

/**
 * Dashboard banner shown only when something is wrong: the API or database is unreachable, or
 * (when SHOW_WORKER_ALERT is on) no background worker is running, so Refresh now and the
 * scheduled updates wait. Renders nothing when all is well.
 */
export function SystemAlerts() {
  const health = useHealth()
  const jobs = useJobs(SHOW_WORKER_ALERT)

  const alerts: { key: string; tone: 'down' | 'warn'; icon: LucideIcon; body: ReactNode }[] = []

  if (health.isError) {
    alerts.push({
      key: 'api',
      tone: 'down',
      icon: CircleAlert,
      body: 'Can’t reach the CarrierSafetyScan API. Data on this page may be out of date.',
    })
  } else if (health.data && health.data.database !== 'ok') {
    alerts.push({
      key: 'database',
      tone: 'down',
      icon: CircleAlert,
      body: 'The database is unreachable: carrier data can’t load or refresh right now.',
    })
  }

  if (SHOW_WORKER_ALERT && jobs.data && !jobs.data.worker_running) {
    const waiting = jobs.data.counts.QUEUED ?? 0
    alerts.push({
      key: 'worker',
      tone: 'warn',
      icon: AlertTriangle,
      body: (
        <>
          The background worker isn’t running, so <strong>Refresh now</strong> and the scheduled
          15-minute updates won’t run
          {waiting > 0 && ` (${waiting} refresh${waiting === 1 ? '' : 'es'} waiting)`}. Start it in{' '}
          <code className="text-xs">backend/</code> with{' '}
          <code className="text-xs">python -m app.workers.worker</code>.
        </>
      ),
    })
  }

  if (alerts.length === 0) return null

  return (
    <div className="space-y-2" role="status">
      {alerts.map(({ key, tone, icon: Icon, body }) => (
        <div
          key={key}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            tone === 'down'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-600/30 bg-amber-50 text-amber-700'
          }`}
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{body}</p>
        </div>
      ))}
    </div>
  )
}
