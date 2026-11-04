import {
  ClipboardList,
  FileText,
  History,
  IdCard,
  Receipt,
  ScrollText,
  ShieldCheck,
  TrendingDown,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { LABEL, useRise } from './ui'

/** The tabs of the carrier's own page (pages/CarrierProfilePage.tsx, CLIENT_TABS), by ?tab= id. */
const TABS: { tab: string | null; label: string; icon: LucideIcon }[] = [
  { tab: null, label: 'Overview', icon: IdCard },
  { tab: 'authority', label: 'Authority & insurance', icon: ScrollText },
  { tab: 'safety', label: 'Inspections', icon: TrendingDown },
  { tab: 'equipment', label: 'Equipment', icon: Truck },
  { tab: 'network', label: 'How brokers see you', icon: ShieldCheck },
  { tab: 'safety-score-report', label: 'Safety Score Report', icon: FileText },
  { tab: 'compliance', label: 'Compliance', icon: ClipboardList },
  { tab: 'invoices', label: 'Invoices', icon: Receipt },
  { tab: 'timeline', label: 'History', icon: History },
]

/** One tap into each part of the carrier's page. */
export function TabLinks({ page, index }: { page: string; index: number }) {
  const rise = useRise()
  return (
    <motion.nav {...rise(index)} aria-label="Your carrier’s page">
      <div className={`${LABEL} mb-2 text-slate-500`}>Jump to</div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <li key={label}>
            <Link
              to={tab ? `${page}?tab=${tab}` : page}
              className="group flex h-full min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-accent hover:text-accent-strong xl:flex-col xl:items-start xl:gap-1.5"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#101853] text-white transition-transform group-hover:scale-105">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 leading-tight">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </motion.nav>
  )
}
