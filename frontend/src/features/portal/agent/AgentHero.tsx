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
 * as `children`), beside the cover of the underwriting file the review fills in.
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
          <FileCover agencyName={agencyName} npn={npn} guideLink={guideLink} />
        </motion.div>
      </motion.div>
    </section>
  )
}

/**
 * The banner's right side: the cover of an underwriting file, on fixed paper colours so it reads
 * the same in both themes. Only real details: the agency and NPN from sign-up, today's date, and
 * the carrier tabs the review goes through.
 */
function FileCover({
  agencyName,
  npn,
  guideLink,
}: {
  agencyName: string
  npn: string | null | undefined
  guideLink: boolean
}) {
  const reduce = useReducedMotion()
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <div className="relative pt-5">
      <span className="font-label absolute left-5 top-0 rounded-t-xl bg-[#f3e7c9] px-4 pb-3 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#5b4a1f]">
        Underwriting file
      </span>
      <div className="relative rotate-[0.6deg] rounded-2xl rounded-tl-none bg-[#fbf6e9] p-5 text-[#1f2433] shadow-2xl ring-1 ring-black/5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-b border-dashed border-[#d9cba5] pb-3 text-sm">
          <dt className="text-[#6b6455]">Agency</dt>
          <dd className="truncate font-medium">{agencyName}</dd>
          <dt className="text-[#6b6455]">NPN</dt>
          <dd className="font-mono">{npn ?? '—'}</dd>
          <dt className="text-[#6b6455]">Date</dt>
          <dd>{today}</dd>
          <dt className="text-[#6b6455]">Carrier</dt>
          <dd className="italic text-[#6b6455]">Search to open one</dd>
        </dl>
        <p className="font-label mt-3 text-[10.5px] uppercase tracking-[0.14em] text-[#6b6455]">
          Contents · {CHECKLIST.length} tabs
        </p>
        <ol className="mt-2 space-y-1.5">
          {CHECKLIST.map(({ tab, label, icon: Icon }, i) => (
            <motion.li
              key={tab}
              initial={reduce ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.5 + i * 0.1, ease }}
              className="flex items-center gap-2.5 text-sm"
            >
              <span className="font-label w-5 text-xs text-[#8a7f63]">{i + 1}.</span>
              <Icon className="size-4 text-[#101853]" aria-hidden />
              <span className="flex-1 border-b border-dotted border-[#d9cba5]">{label}</span>
            </motion.li>
          ))}
        </ol>
        {guideLink && (
          <a
            href="#underwriting-checklist"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#101853] underline-offset-4 hover:underline"
          >
            How to read each one
            <ArrowDown className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  )
}
