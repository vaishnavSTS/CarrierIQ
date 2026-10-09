import {
  BadgeAlert,
  Copy,
  FileWarning,
  Gauge,
  IdCard,
  Radio,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import type { RecentSignal } from '../../types/dashboard'
import { timeAgo } from '../../utils/format'
import { severityTone } from '../../utils/status'

const TYPE_ICON: Record<string, LucideIcon> = {
  AUTHORITY_CHANGE: BadgeAlert,
  INSURANCE_CHANGE: FileWarning,
  IDENTITY_CHANGE: IdCard,
  SAFETY_TREND: TrendingUp,
  FLEET_CONSISTENCY: Gauge,
  SHARED_VIN: Copy,
}

/** The newest review signals across every carrier; new ones slide in at the top. */
export function LiveSignalFeed({ signals }: { signals: RecentSignal[] | undefined }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-surface/25 p-5 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Radio className="size-4 text-accent-strong" aria-hidden />
          Live intelligence
        </h2>
        <span className="text-xs text-slate-500">Newest signals · updates every 15 s</span>
      </div>

      {signals === undefined ? (
        <ul className="space-y-2" aria-label="Loading signals">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </ul>
      ) : signals.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="size-4" aria-hidden /> No review signals yet.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={true}>
            {signals.map((s, i) => {
              const Icon = TYPE_ICON[s.signal_type] ?? BadgeAlert
              return (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    to={`/carriers/${s.usdot_number}?tab=intelligence&signal=${s.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50"
                  >
                    <span className="mt-0.5 rounded-lg bg-accent-soft p-1.5 text-accent-strong">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={s.severity.toLowerCase()}
                          tone={severityTone(s.severity)}
                        />
                        <span className="truncate text-sm font-medium text-slate-900 group-hover:text-accent-strong">
                          {s.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {s.legal_name} · USDOT {s.usdot_number} · {timeAgo(s.detected_at)}
                      </span>
                    </span>
                  </Link>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
