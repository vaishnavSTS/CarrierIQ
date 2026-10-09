import { ClipboardCheck, ShieldAlert, Truck, Building2, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { AnimatedNumber } from '../../components/AnimatedNumber'
import type { DashboardTotals, RecentSignal } from '../../types/dashboard'
import { CarrierSearchBox } from '../carrier-search/CarrierSearchBox'
import { HeroBoard } from './HeroBoard'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon
  label: string
  value: number | undefined
  note: string
}) {
  return (
    <motion.div
      variants={item}
      className="rounded-xl border border-slate-200/80 bg-canvas/60 px-4 py-3 backdrop-blur"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="size-4 text-accent-strong" aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value === undefined ? '—' : <AnimatedNumber value={value} />}
      </div>
      <div className="text-xs text-slate-500">{note}</div>
    </motion.div>
  )
}

/** Dashboard opener: live status, search and headline numbers, on a see-through card. */
export function DashboardHero({
  totals,
  signals,
}: {
  totals: DashboardTotals | undefined
  signals: RecentSignal[] | undefined
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-surface">
      <HeroBoard signals={signals} />

      <motion.div
        className="relative grid gap-6 p-6 md:p-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={item}
          className="flex items-center gap-2 text-xs font-medium text-slate-600"
        >
          <span className="relative flex size-2">
            <span className="live-ping absolute inline-flex size-full rounded-full bg-emerald-600" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
          </span>
          Live · FMCSA and NHTSA public records
        </motion.div>

        <motion.div variants={item} className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Carrier intelligence,{' '}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
              backed by evidence
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Look up any motor carrier by USDOT, MC/MX/FF docket or name. Every signal links to the
            federal records behind it.
          </p>
        </motion.div>

        <motion.div variants={item} className="max-w-2xl">
          <CarrierSearchBox autoFocus />
          <p className="mt-2 text-xs text-slate-500">
            Try <span className="font-mono text-slate-700">297569</span>,{' '}
            <span className="font-mono text-slate-700">MC139446</span> or{' '}
            <span className="font-mono text-slate-700">united moving</span>
          </p>
        </motion.div>

        <motion.div variants={container} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Building2}
            label="Carriers"
            value={totals?.carriers}
            note="FMCSA Company Census, loaded in CarrierIQ"
          />
          <StatTile
            icon={ClipboardCheck}
            label="Inspections"
            value={totals?.inspections}
            note="FMCSA Vehicle Inspection File"
          />
          <StatTile
            icon={Truck}
            label="Vehicles"
            value={totals?.vehicles}
            note="FMCSA inspections (VINs), decoded by NHTSA vPIC"
          />
          <StatTile
            icon={ShieldAlert}
            label="Open signals"
            value={totals?.open_signals}
            note="CarrierIQ rules over FMCSA records"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
