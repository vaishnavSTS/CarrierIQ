import { BadgeCheck, Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import type { Brokerage } from '../../types/auth'
import { formatLocalDate } from '../../utils/format'
import { HeroBoard } from '../dashboard/HeroBoard'

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
    <section className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-surface">
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
            className="flex items-center gap-2 text-xs font-medium text-slate-600"
          >
            <span className="relative flex size-2">
              <span className="live-ping absolute inline-flex size-full rounded-full bg-emerald-600" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            Live · FMCSA and NHTSA public records
          </motion.div>

          <motion.div variants={item}>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Welcome{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">
                Vet any carrier before you book the load
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Enter a USDOT number, MC number or carrier name. CarrierIQ pulls the carrier’s FMCSA
              record and shows what needs a closer look.
            </p>
          </motion.div>

          <motion.div variants={item}>{children}</motion.div>

          <motion.p
            variants={item}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600"
          >
            <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
            <span className="font-medium text-slate-900">{brokerageName}</span>
            {brokerage && (
              <>
                · broker authority confirmed with{' '}
                {SOURCE_LABEL[brokerage.authority_source ?? ''] ?? 'FMCSA'}
                {brokerage.docket_number && (
                  <span className="font-mono text-slate-900">{brokerage.docket_number}</span>
                )}
                {brokerage.usdot_number && (
                  <span className="font-mono text-slate-900">· USDOT {brokerage.usdot_number}</span>
                )}
                {brokerage.authority_checked_at && (
                  <span className="text-slate-500">
                    · checked {formatLocalDate(brokerage.authority_checked_at)}
                  </span>
                )}
              </>
            )}
          </motion.p>
        </div>

        <motion.div variants={item} className="hidden md:block">
          <ExampleCheck />
        </motion.div>
      </motion.div>
    </section>
  )
}

const CHECKS: { label: string; value: string; tone: 'ok' | 'warn' }[] = [
  { label: 'Operating authority', value: 'Active', tone: 'ok' },
  { label: 'Insurance on file', value: '$1,000,000 BI&PD', tone: 'ok' },
  { label: 'Process agent (BOC-3)', value: 'On file', tone: 'ok' },
  { label: 'Out-of-service orders', value: 'None', tone: 'ok' },
  { label: 'Linked carriers', value: 'Same phone as 1 other', tone: 'warn' },
]

/** A made-up carrier's check, ticking in one row at a time. Labelled as an example. */
function ExampleCheck() {
  const reduce = useReducedMotion()
  const step = 0.35
  const start = 0.6

  return (
    <div className="rounded-2xl border border-slate-200 bg-canvas/80 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">Example carrier check</span>
        <span className="text-xs text-slate-500">Sample data</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {CHECKS.map((c, i) => (
          <motion.li
            key={c.label}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: start + i * step, ease }}
            className="flex items-center gap-3 text-sm"
          >
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 18,
                delay: start + i * step + 0.2,
              }}
              className={`grid size-5 shrink-0 place-items-center rounded-full ${
                c.tone === 'ok'
                  ? 'bg-emerald-500/20 text-emerald-600'
                  : 'bg-amber-500/20 text-amber-600'
              }`}
            >
              {c.tone === 'ok' ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className="text-xs font-bold" aria-hidden>
                  !
                </span>
              )}
            </motion.span>
            <span className="text-slate-700">{c.label}</span>
            <span
              className={`ml-auto text-right text-xs ${c.tone === 'ok' ? 'text-slate-500' : 'font-medium text-amber-600'}`}
            >
              {c.value}
            </span>
          </motion.li>
        ))}
      </ul>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: start + CHECKS.length * step + 0.1, ease }}
        className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-surface px-4 py-3"
      >
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Estimated ISS – Safety score
          </div>
          <div className="text-xs text-slate-500">1–100 · lower is better</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold tabular-nums text-slate-950">38</span>
          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/30">
            Satisfactory
          </span>
        </div>
      </motion.div>
    </div>
  )
}
