import { motion, useReducedMotion } from 'motion/react'

import type { OosWindow } from '../../../types/carrierProfile'
import { formatPercent } from '../../../utils/format'
import { ease } from './ui'

/**
 * Vehicle and driver out-of-service rates as bars from zero, each with a tick at FMCSA's national
 * average, so "above or below average" reads at a glance. Both rows share one scale.
 */
export function OosBars({ recent }: { recent: OosWindow }) {
  const reduce = useReducedMotion()
  const rows = [
    {
      label: 'Vehicle',
      rate: recent.vehicle_oos_rate,
      national: recent.national_vehicle_oos_rate,
      oos: recent.vehicle_oos,
      base: recent.vehicle_inspections,
    },
    {
      label: 'Driver',
      rate: recent.driver_oos_rate,
      national: recent.national_driver_oos_rate,
      oos: recent.driver_oos,
      base: recent.driver_inspections,
    },
  ]
  // Round the top of the scale up to the next 10%, leaving room past the longer bar or tick.
  const top = Math.max(
    0.1,
    Math.ceil((Math.max(...rows.flatMap((r) => [r.rate ?? 0, r.national])) * 1.15) / 0.1) * 0.1,
  )
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`

  return (
    <dl className="space-y-4">
      {rows.map((r, i) => {
        const above = r.rate !== null && r.rate > r.national
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm font-medium text-slate-800">{r.label}</dt>
              <dd className="text-right">
                <span
                  className={`text-xl font-semibold tabular-nums ${above ? 'text-amber-700' : 'text-slate-950'}`}
                >
                  {formatPercent(r.rate)}
                </span>
              </dd>
            </div>
            <div
              className="relative mt-1.5 h-2.5 rounded-full bg-slate-100"
              role="img"
              aria-label={`${r.label} out-of-service rate ${formatPercent(r.rate)}, national average ${formatPercent(r.national)}`}
            >
              {r.rate !== null && (
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full ${above ? 'bg-amber-500' : 'bg-accent'}`}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: pct(r.rate) }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease }}
                />
              )}
              <span
                className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-slate-500"
                style={{ left: pct(r.national) }}
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {r.base > 0
                ? `${r.oos} of ${r.base} inspection${r.base === 1 ? '' : 's'} · `
                : `No ${r.label.toLowerCase()} inspections · `}
              national average {formatPercent(r.national)}
            </p>
          </div>
        )
      })}
    </dl>
  )
}
