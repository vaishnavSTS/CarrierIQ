import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import type { ActionItem } from './actionItems'
import { CARD, LABEL, useRise } from './ui'

/**
 * The dates ahead on a timeline: the MCS-150 month (49 CFR 390.19) and the insurance renewals
 * expected from past filings (labelled as estimates). Items come from actionItems, so nothing here
 * is invented: no dates on record, no timeline.
 */
export function ComingUp({ items }: { items: ActionItem[] }) {
  const rise = useRise()
  return (
    <motion.section {...rise(3)} className={CARD} aria-labelledby="coming-up">
      <div className="flex items-center gap-3">
        <div>
          <div className={`${LABEL} text-slate-500`}>Plan ahead</div>
          <h2 id="coming-up" className="text-lg font-semibold leading-tight text-slate-950">
            Coming up
          </h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No dates on record to plan for yet.</p>
      ) : (
        <ol className="relative mt-5 space-y-5 border-l-2 border-slate-200 pl-5">
          {items.map((item) => (
            <li key={item.key} className="relative" title={item.more}>
              <span
                aria-hidden
                className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-surface ${
                  item.level === 'due' ? 'bg-amber-500' : 'bg-[var(--portal-ink)]'
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                {item.badge && <StatusBadge {...item.badge} />}
              </div>
              <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
              <Link
                to={item.to}
                className="tap mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-accent-strong hover:underline"
              >
                {item.linkLabel}
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </motion.section>
  )
}
