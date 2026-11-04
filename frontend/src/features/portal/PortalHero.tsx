import { ArrowRight, FileSearch } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { useDataQsCases } from '../../hooks/useDataQs'
import type { PortalCarrier } from '../../types/auth'
import { greeting } from './greeting'
import { PortalHeroBackdrop } from './PortalHeroBackdrop'
import { ExampleCheck } from './ExampleCheck'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
}

/**
 * Carrier portal opener on the same moving board as the staff dashboard. The board is given no
 * signals, so it shows only its generic "what Carrier Safety Scan checks" cards: STS signals and
 * other carriers never reach a carrier account. The counts are the company's own: its carriers
 * and its DataQs requests.
 */
export function PortalHero({
  firstName,
  organizationName,
  carriers,
}: {
  firstName: string | undefined
  organizationName: string | undefined
  carriers: PortalCarrier[] | undefined
}) {
  const reduce = useReducedMotion()
  const dataqs = useDataQsCases()
  const only = carriers?.length === 1 ? carriers[0] : undefined
  const open = dataqs.data?.cases.filter((c) => c.work_status !== 'CLOSED') ?? []
  const waiting = open.filter((c) => c.action_owner === 'CARRIER').length

  const stats: { label: string; value: number | undefined; tone?: 'gold' }[] = [
    {
      label: carriers?.length === 1 ? 'Carrier linked' : 'Carriers linked',
      value: carriers?.length,
    },
    { label: 'Open DataQs requests', value: dataqs.data ? open.length : undefined },
    {
      label: 'Waiting on you',
      value: dataqs.data ? waiting : undefined,
      tone: waiting > 0 ? 'gold' : undefined,
    },
  ]

  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-3xl border border-white/15 shadow-xl">
      <PortalHeroBackdrop tone="carrier" />

      <motion.div
        className={`relative grid gap-6 p-5 sm:p-6 md:p-8 ${carriers?.length === 0 ? 'lg:grid-cols-[1.25fr_1fr] lg:items-center' : 'lg:grid-cols-[1fr_auto] lg:items-end'}`}
        variants={container}
        initial={reduce ? false : 'hidden'}
        animate="show"
      >
        <div className="grid min-w-0 gap-5">
          <motion.div
            variants={item}
            className="font-label flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/90"
          >
            <span className="relative flex size-2">
              <span className="live-ping absolute inline-flex size-full rounded-full bg-emerald-500" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · FMCSA and NHTSA public records
          </motion.div>

          <motion.div variants={item} className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.{' '}
              <span className="text-[var(--hero-highlight)]">
                See your carrier the way brokers do
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/90">
              {organizationName && <span className="text-white">{organizationName} · </span>}
              Every value comes from FMCSA’s own records and names its source.
            </p>
          </motion.div>

          {carriers && carriers.length > 0 && (
            <motion.div variants={item} className="flex flex-wrap gap-2">
              {only && (
                <Link
                  to={`/portal/carriers/${only.usdot_number}`}
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--hero-cta)] px-5 py-3 text-sm font-medium text-[var(--hero-cta-ink)] shadow-lg shadow-brand-glow/30 transition-all hover:bg-cta-hover hover:shadow-xl active:bg-cta-active"
                >
                  Open {only.legal_name ?? `USDOT ${only.usdot_number}`}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              )}
              <Link
                to="/portal/dataqs"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <FileSearch className="size-4" aria-hidden />
                DataQs requests
              </Link>
            </motion.div>
          )}
        </div>

        {carriers && carriers.length > 0 && (
          <motion.dl variants={item} className="grid grid-cols-3 gap-2 lg:w-[22rem]">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex min-w-0 flex-col-reverse rounded-2xl border border-white/15 bg-[var(--hero-fade)] px-3 py-3 backdrop-blur"
              >
                <dt className="mt-0.5 text-[11px] leading-tight text-white/80">{s.label}</dt>
                <dd
                  className={`text-2xl font-semibold tabular-nums md:text-3xl ${s.tone === 'gold' ? 'text-[var(--hero-highlight)]' : 'text-white'}`}
                >
                  {s.value ?? '—'}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}

        {carriers?.length === 0 && (
          <motion.div variants={item} className="hidden md:block">
            <ExampleCheck title="What a broker’s check might show" />
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
