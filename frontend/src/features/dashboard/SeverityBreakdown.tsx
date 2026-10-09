import { motion } from 'motion/react'

import { AnimatedNumber } from '../../components/AnimatedNumber'
import type { DashboardTotals } from '../../types/dashboard'

const ROWS = [
  { key: 'HIGH', label: 'High', bar: 'bg-red-600' },
  { key: 'MEDIUM', label: 'Medium', bar: 'bg-amber-600' },
  { key: 'LOW', label: 'Low', bar: 'bg-slate-500' },
] as const

/** Open signals by severity, as bars that grow in to scale. */
export function SeverityBreakdown({ totals }: { totals: DashboardTotals | undefined }) {
  const counts = totals?.open_by_severity
  const max = Math.max(1, ...(counts ? Object.values(counts) : [0]))
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-surface/25 p-5 shadow-xl shadow-black/20">
      <h2 className="text-sm font-semibold text-slate-900">Open signals by severity</h2>
      <p className="text-xs text-slate-500">Across all loaded carriers, not yet reviewed</p>
      <dl className="mt-4 space-y-3">
        {ROWS.map(({ key, label, bar }) => {
          const n = counts?.[key] ?? 0
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <dt className="text-slate-700">{label}</dt>
                <dd className="font-semibold text-slate-900">
                  {counts ? <AnimatedNumber value={n} /> : '—'}
                </dd>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-50">
                <motion.div
                  className={`h-full rounded-full ${bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(n / max) * 100}%` }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
