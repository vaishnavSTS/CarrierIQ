import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileSearch,
  Hourglass,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import type { Tone } from '../../../utils/status'
import { FixWithSky } from '../../carrier-profile/FixWithSky'
import { needsAction, type ActionItem, type ActionLevel } from './actionItems'
import { CARD, LABEL, useRise } from './ui'

const LEVEL: Record<
  ActionLevel,
  { icon: LucideIcon; tile: string; badge?: { label: string; tone: Tone } }
> = {
  alert: {
    icon: CircleAlert,
    tile: 'bg-red-50 text-red-700 ring-red-600/20',
    badge: { label: 'Broker flag', tone: 'down' },
  },
  attention: {
    icon: AlertTriangle,
    tile: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    badge: { label: 'Needs a look', tone: 'warn' },
  },
  due: {
    icon: CalendarClock,
    tile: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    badge: { label: 'Coming up', tone: 'warn' },
  },
  working: { icon: Hourglass, tile: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  scheduled: { icon: CalendarClock, tile: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
}

/**
 * Top of the carrier's snapshot: everything that needs them, most pressing first, each with
 * where to deal with it. "Nothing to do" is only claimed once the broker-check records loaded.
 */
export function ActionCenter({
  items,
  records,
  usdotNumber,
}: {
  items: ActionItem[]
  /** The registration checks behind the broker-check flags */
  records: 'checking' | 'failed' | 'ready'
  usdotNumber: number
}) {
  const rise = useRise()
  const open = items.filter(needsAction).length

  return (
    <motion.section {...rise(0)} className={CARD} aria-labelledby={`actions-${usdotNumber}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--portal-ink)] text-white">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <div className={`${LABEL} text-slate-500`}>Action center</div>
            <h3
              id={`actions-${usdotNumber}`}
              className="text-lg font-semibold leading-tight text-slate-950"
            >
              {records === 'checking'
                ? 'Checking your FMCSA records…'
                : records === 'failed'
                  ? 'Couldn’t check what brokers’ checks would flag. Try again shortly.'
                  : open === 0
                    ? 'Nothing needs your action right now'
                    : `${open} item${open === 1 ? '' : 's'} need${open === 1 ? 's' : ''} your attention`}
            </h3>
          </div>
        </div>
        {records === 'ready' && open === 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CircleCheck className="size-4" aria-hidden />
            Nothing brokers usually flag
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {items.map((item, i) => (
            <ActionRow key={item.key} item={item} index={i} usdotNumber={usdotNumber} />
          ))}
        </ul>
      )}
    </motion.section>
  )
}

function ActionRow({
  item,
  index,
  usdotNumber,
}: {
  item: ActionItem
  index: number
  usdotNumber: number
}) {
  const rise = useRise()
  const level = LEVEL[item.level]
  const badge = item.badge ?? level.badge
  const Icon = item.kind === 'dataqs' && item.level !== 'attention' ? FileSearch : level.icon

  return (
    <motion.li {...rise(index + 1)} className="flex gap-3 py-3.5" title={item.more}>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${level.tile}`}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-slate-900">{item.title}</span>
          {badge && <StatusBadge {...badge} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {item.fixTopic && <FixWithSky topic={item.fixTopic} usdotNumber={usdotNumber} />}
          <Link
            to={item.to}
            className="tap mt-1.5 inline-flex items-center gap-0.5 text-sm font-medium text-accent-strong hover:underline"
          >
            {item.linkLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </motion.li>
  )
}
