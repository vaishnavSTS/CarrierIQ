import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import type { Safety } from '../../../types/carrierProfile'
import type { CrashSummary } from '../../../types/carrierSafety'
import { formatDate, humanize } from '../../../utils/format'
import { OosBars } from './OosBars'
import { CARD, LABEL, LINK, useRise } from './ui'

/** Out-of-service rates against the national average, then the roadside record in four facts. */
export function RoadsideCard({
  safety,
  crashes,
  to,
  index,
}: {
  safety: Safety
  /** null/undefined: FMCSA's crash file not loaded (yet) */
  crashes: CrashSummary | null | undefined
  to: string
  index: number
}) {
  const rise = useRise()
  const recent = safety.recent

  const facts: { label: string; value: string; note?: string }[] = [
    {
      label: 'Inspections',
      value: String(recent?.inspections ?? 0),
      note: `last ${recent?.months ?? 24} months`,
    },
    { label: 'Last inspection', value: formatDate(safety.last_inspection_date) },
    ...(crashes
      ? [
          {
            label: 'Crashes',
            value: String(crashes.recent_total),
            note: `last ${crashes.recent_months} months`,
          },
        ]
      : []),
    {
      label: 'Safety rating',
      value: safety.safety_rating ? humanize(safety.safety_rating.toLowerCase()) : 'Not rated',
      note: safety.safety_rating_date
        ? `rated ${formatDate(safety.safety_rating_date)}`
        : undefined,
    },
  ]

  return (
    <motion.div {...rise(index)} className={`${CARD} flex flex-col`}>
      <div className={`${LABEL} text-slate-500`}>
        Out-of-service rates · last {recent?.months ?? 24} months
      </div>
      <div className="mt-3">
        {recent && recent.inspections > 0 ? (
          <>
            <OosBars recent={recent} />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-block h-2 w-4 rounded-full bg-accent" aria-hidden />
              your rate
              <span className="ml-2 inline-block h-3 w-0.5 rounded-full bg-slate-500" aria-hidden />
              national average (FMCSA SAFER)
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">No roadside inspections in this period.</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-slate-500">{f.label}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-slate-900">
              {f.value}
            </dd>
            {f.note && <dd className="text-[11px] text-slate-500">{f.note}</dd>}
          </div>
        ))}
      </dl>

      <Link to={to} className={`${LINK} mt-auto inline-flex items-center gap-0.5 pt-4`}>
        Inspections and violations
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </motion.div>
  )
}
