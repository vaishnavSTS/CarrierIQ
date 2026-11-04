import { BadgeCheck, Hash, Building2, FileDigit } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import type { Brokerage } from '../../types/auth'
import { greeting } from './greeting'
import { PortalHeroBackdrop } from './PortalHeroBackdrop'
import { ease } from './broker/reveal'

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
 * Broker portal opener, a wide search band over the moving load board: the brokerage, the carrier
 * search (passed in as `children`) front and centre, and what to search by. How the booking check
 * grades carriers is in the side rail below (VerdictLadder).
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
      <PortalHeroBackdrop tone="broker" />

      <motion.div
        className="relative mx-auto max-w-4xl space-y-5 p-5 text-center sm:p-6 md:px-8 md:py-12"
        variants={container}
        initial={reduce ? false : 'hidden'}
        animate="show"
      >
        <motion.div
          variants={item}
          className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-white/90"
        >
          <span className="font-label inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--portal-accent)]">
            <span className="relative flex size-2">
              <span className="live-ping absolute inline-flex size-full rounded-full bg-[var(--portal-accent)]" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--portal-accent)]" />
            </span>
            Vetting desk
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BadgeCheck className="size-4 shrink-0 text-white" aria-hidden />
            <span className="truncate font-medium text-white">{brokerageName}</span>
            {brokerage?.docket_number && (
              <span className="shrink-0 font-mono text-white/90">{brokerage.docket_number}</span>
            )}
          </span>
        </motion.div>

        <motion.div variants={item}>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}.{' '}
            <span className="block text-[var(--hero-highlight)]">Who’s hauling the next load?</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/90">
            Search the carrier and get its booking check: authority, insurance on file, safety
            record and fraud red flags, read in the order brokers check them.
          </p>
        </motion.div>

        <motion.div variants={item} className="mx-auto max-w-2xl text-left">
          {children}
        </motion.div>

        <motion.ul
          variants={item}
          className="flex flex-wrap justify-center gap-2 text-xs text-white/90"
          aria-label="You can search by"
        >
          {SEARCH_BY.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1"
            >
              <Icon className="size-3.5 text-[var(--portal-accent)]" aria-hidden />
              {label}
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </section>
  )
}
