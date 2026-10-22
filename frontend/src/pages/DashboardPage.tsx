import { motion } from 'motion/react'

import { DashboardHero } from '../features/dashboard/DashboardHero'
import { LiveSignalFeed } from '../features/dashboard/LiveSignalFeed'
import { SeverityBreakdown } from '../features/dashboard/SeverityBreakdown'
import { JobsCard } from '../features/system-status/JobsCard'
import { SHOW_WORKER_ALERT, SystemAlerts } from '../features/system-status/SystemAlerts'
import { useDashboard } from '../hooks/useDashboard'

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
})

export function DashboardPage() {
  const { data } = useDashboard()

  return (
    <>
      <div className="space-y-6">
        <SystemAlerts />
        <DashboardHero totals={data?.totals} signals={data?.recent_signals} />

        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div className="min-w-0 lg:col-span-2" {...rise(0.3)}>
            <LiveSignalFeed signals={data?.recent_signals} />
          </motion.div>
          <motion.div className="space-y-6" {...rise(0.4)}>
            <SeverityBreakdown totals={data?.totals} />
          </motion.div>
        </div>

        {/* Job status only means something once a background worker runs (same switch as the
            worker banner); until then it would always read "no worker running". */}
        {SHOW_WORKER_ALERT && (
          <motion.div {...rise(0.5)}>
            <JobsCard />
          </motion.div>
        )}
      </div>
    </>
  )
}
