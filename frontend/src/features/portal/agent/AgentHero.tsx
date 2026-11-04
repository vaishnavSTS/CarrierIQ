import { ArrowDown, Building2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { HeroBoard } from '../../dashboard/HeroBoard'
import { CHECKLIST } from './checklist'

const ease = [0.16, 1, 0.3, 1] as const

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}

/**
 * Insurance agent portal opener: welcome, their agency and NPN, and the carrier search (passed in
 * as `children`), beside the carrier tabs an underwriting review goes through.
 */
export function AgentHero({
  firstName,
  agencyName,
  npn,
  guideLink,
  children,
}: {
  firstName: string | undefined
  agencyName: string
  npn: string | null | undefined
  /** The checklist is on the page below (not while search results show) */
  guideLink: boolean
  children: ReactNode
}) {
  const reduce = useReducedMotion()

  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-3xl border border-white/15 shadow-xl">
      <HeroBoard signals={undefined} />

      <motion.div
        className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1.25fr_1fr] lg:items-center"
        variants={container}
        initial={reduce ? false : 'hidden'}
        animate="show"
      >
        <div className="min-w-0 space-y-5">
          <motion.div
            variants={item}
            className="flex items-center gap-2 text-xs font-medium text-white/90"
          >
            <span className="relative flex size-2">
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            Live · FMCSA and NHTSA public records
          </motion.div>

          <motion.div variants={item}>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Welcome{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="text-[var(--hero-highlight)]">
                Look up the carrier you’re quoting
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/90">
              Enter a USDOT number, MC number or carrier name. You get the carrier’s authority and
              insurance filings, safety record, fleet and linked carriers from FMCSA, with the
              source named on every value.
            </p>
          </motion.div>

          <motion.div variants={item}>{children}</motion.div>

          <motion.p
            variants={item}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/90"
          >
            <Building2 className="size-4 text-white" aria-hidden />
            <span className="font-medium text-white">{agencyName}</span>
            {npn && <span className="font-mono text-white">· NPN {npn}</span>}
          </motion.p>
        </div>

        <motion.div variants={item} className="hidden md:block">
          <div className="rounded-2xl border border-white/15 bg-[#060d24]/55 p-5 text-white shadow-2xl backdrop-blur">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">Before you quote, open</span>
              <span className="font-label text-[10.5px] uppercase tracking-[0.14em] text-amber-300">
                {CHECKLIST.length} tabs
              </span>
            </div>
            <ol className="mt-4 space-y-2">
              {CHECKLIST.map(({ tab, label, icon: Icon, question }, i) => (
                <motion.li
                  key={tab}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.5 + i * 0.12, ease }}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#101853] ring-1 ring-white/15">
                    <Icon className="size-4 text-amber-300" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block truncate text-xs text-white/75">{question}</span>
                  </span>
                </motion.li>
              ))}
            </ol>
            {guideLink && (
              <a
                href="#underwriting-checklist"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-white underline-offset-4 hover:underline"
              >
                How to read each one
                <ArrowDown className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
