import { ArrowDown, Building2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { greeting } from '../greeting'
import { PortalHeroBackdrop } from '../PortalHeroBackdrop'
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
 * as `children`), beside the review path: the carrier tabs an underwriting review goes through.
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
      <PortalHeroBackdrop tone="agent" />

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
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.{' '}
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
          <ReviewPath guideLink={guideLink} />
        </motion.div>
      </motion.div>
    </section>
  )
}

/**
 * The banner's right side: the review path, open on the banner (no card). The six carrier tabs
 * in the order an underwriting review goes, each with the question it answers, down a thin line.
 */
function ReviewPath({ guideLink }: { guideLink: boolean }) {
  const reduce = useReducedMotion()
  return (
    <div className="text-white">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hero-highlight)]">
        Your review, tab by tab
      </p>
      <ol className="relative mt-4 space-y-3.5">
        {/* The line the steps hang on */}
        <motion.span
          aria-hidden
          className="absolute bottom-3 left-[13px] top-3 w-px origin-top bg-gradient-to-b from-[var(--hero-highlight)] to-white/20"
          initial={reduce ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.9, delay: 0.4, ease }}
        />
        {CHECKLIST.map(({ tab, label, question }, i) => (
          <motion.li
            key={tab}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.1, ease }}
            className="relative flex items-start gap-3.5"
          >
            <span className="relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full bg-[#101853] text-xs font-semibold tabular-nums text-[var(--hero-highlight)] ring-1 ring-[var(--hero-highlight)]/60">
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-sm font-semibold leading-tight">{label}</span>
              <span className="block text-xs leading-snug text-white/75">{question}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      {guideLink && (
        <a
          href="#underwriting-checklist"
          className="mt-4 ml-[41px] inline-flex items-center gap-1 text-xs font-medium text-white/90 underline-offset-4 hover:text-white hover:underline"
        >
          How to read each one
          <ArrowDown className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  )
}
