import { BadgeCheck } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import type { Brokerage } from '../../types/auth'
import { formatLocalDate } from '../../utils/format'
import { HeroBoard } from '../dashboard/HeroBoard'
import { ExampleCheck } from './ExampleCheck'

const ease = [0.16, 1, 0.3, 1] as const

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}

const SOURCE_LABEL: Record<string, string> = {
  MOTUS: 'FMCSA Motus',
  LEGACY_LI: 'FMCSA L&I',
}

/**
 * Broker portal opener: welcome, their brokerage's verified authority, and the carrier search
 * (passed in as `children`), beside an animated example of the checks a carrier profile shows.
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
  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-2xl border border-white/15">
      <HeroBoard signals={undefined} />

      <motion.div
        className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1.25fr_1fr] lg:items-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <div className="min-w-0 space-y-5">
          <motion.div
            variants={item}
            className="flex items-center gap-2 text-xs font-medium text-white/90"
          >
            <span className="relative flex size-2">
              <span className="live-ping absolute inline-flex size-full rounded-full bg-emerald-600" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            Live · FMCSA and NHTSA public records
          </motion.div>

          <motion.div variants={item}>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Welcome{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="text-[var(--hero-highlight)]">
                {brokerage?.license_number
                  ? 'Check any carrier’s safety and insurance record'
                  : 'Vet any carrier before you book the load'}
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/90">
              Enter a USDOT number, MC number or carrier name. CarrierSafetyScan pulls the carrier’s
              FMCSA record and shows what needs a closer look.
            </p>
          </motion.div>

          <motion.div variants={item}>{children}</motion.div>

          <motion.p
            variants={item}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/90"
          >
            <BadgeCheck className="size-4 text-white" aria-hidden />
            <span className="font-medium text-white">{brokerageName}</span>
            {brokerage && !brokerage.license_number && (
              <>
                · broker authority confirmed with{' '}
                {SOURCE_LABEL[brokerage.authority_source ?? ''] ?? 'FMCSA'}
                {brokerage.docket_number && (
                  <span className="font-mono text-white">{brokerage.docket_number}</span>
                )}
                {brokerage.usdot_number && (
                  <span className="font-mono text-white">· USDOT {brokerage.usdot_number}</span>
                )}
                {brokerage.authority_checked_at && (
                  <span className="text-white/90">
                    · checked {formatLocalDate(brokerage.authority_checked_at)}
                  </span>
                )}
              </>
            )}
          </motion.p>
        </div>

        <motion.div variants={item} className="hidden md:block">
          <ExampleCheck title="Example carrier check" />
        </motion.div>
      </motion.div>
    </section>
  )
}
