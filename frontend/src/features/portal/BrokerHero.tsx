import { BadgeCheck, Hash, Building2, FileDigit } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import type { Brokerage } from '../../types/auth'
import { HeroBoard } from '../dashboard/HeroBoard'
import { ease } from './broker/reveal'
import { VerdictLadder } from './broker/VerdictLadder'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}

const SEARCH_BY = [
  { icon: Hash, label: 'USDOT number' },
  { icon: FileDigit, label: 'MC number' },
  { icon: Building2, label: 'Carrier name' },
]

/**
 * Broker portal opener: welcome, the carrier search (passed in as `children`) and what to search
 * by, beside the booking check every carrier page opens with. The brokerage's own FMCSA details
 * are on the card below (BrokerageCard); here just its name.
 */
export function BrokerHero({
  firstName,
  brokerageName,
  brokerage,
  children,
}: {
  firstName: string | undefined
  brokerageName: string
  brokerage: Brokerage | undefined
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-3xl border border-white/15 shadow-xl">
      <HeroBoard signals={undefined} />

      <motion.div
        className="relative grid gap-8 p-5 sm:p-6 md:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center"
        variants={container}
        initial={reduce ? false : 'hidden'}
        animate="show"
      >
        <div className="min-w-0 space-y-5">
          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/90"
          >
            <span className="font-label inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-300">
              <span className="relative flex size-2">
                <span className="relative inline-flex size-2 rounded-full bg-amber-300" />
              </span>
              Carrier vetting
            </span>
            <span>Public FMCSA and NHTSA records</span>
          </motion.div>

          <motion.div variants={item}>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Welcome{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="text-[var(--hero-highlight)]">
                Vet the carrier before you book the load.
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/90">
              Search a carrier to see its authority, insurance on file, safety record and fraud red
              flags, read in the order brokers check them.
            </p>
          </motion.div>

          <motion.div variants={item}>{children}</motion.div>

          <motion.ul
            variants={item}
            className="flex flex-wrap gap-2 text-xs text-white/90"
            aria-label="You can search by"
          >
            {SEARCH_BY.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1"
              >
                <Icon className="size-3.5 text-amber-300" aria-hidden />
                {label}
              </li>
            ))}
          </motion.ul>

          <motion.p
            variants={item}
            className="flex min-w-0 items-center gap-2 text-xs text-white/90"
          >
            <BadgeCheck className="size-4 shrink-0 text-white" aria-hidden />
            <span className="truncate font-medium text-white">{brokerageName}</span>
            {brokerage?.docket_number && (
              <span className="shrink-0 font-mono text-white/90">{brokerage.docket_number}</span>
            )}
          </motion.p>
        </div>

        <motion.div variants={item} className="hidden md:block">
          <VerdictLadder />
        </motion.div>
      </motion.div>
    </section>
  )
}
