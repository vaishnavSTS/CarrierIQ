import {
  ArrowRight,
  FileText,
  IdCard,
  ScrollText,
  ShieldCheck,
  TrendingDown,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import type { PortalCarrier } from '../../types/auth'
import { HeroBoard } from '../dashboard/HeroBoard'
import { ExampleCheck } from './ExampleCheck'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
}

/** The six tabs a client sees for their carrier (docs/client-internal-portal-plan.md, 4a). */
const VIEWS: { icon: LucideIcon; label: string }[] = [
  { icon: IdCard, label: 'Identity' },
  { icon: ScrollText, label: 'Authority & insurance' },
  { icon: TrendingDown, label: 'Safety & how to improve' },
  { icon: Truck, label: 'Equipment' },
  { icon: ShieldCheck, label: 'How brokers see you' },
  { icon: FileText, label: 'Safety Score Report' },
]

/**
 * Client portal opener on the same moving board as the staff dashboard. The board is given no
 * signals, so it shows only its generic "what CarrierSafetyScan checks" cards: STS signals and other
 * carriers never reach a client.
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
  const only = carriers?.length === 1 ? carriers[0] : undefined

  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-2xl border border-white/15">
      <HeroBoard signals={undefined} />

      <motion.div
        className={`relative grid gap-8 p-6 md:p-8 ${carriers?.length === 0 ? 'lg:grid-cols-[1.25fr_1fr] lg:items-center' : ''}`}
        variants={container}
        initial="hidden"
        animate="show"
      >
        <div className="grid min-w-0 gap-6">
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

          <motion.div variants={item} className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Welcome{firstName ? `, ${firstName}` : ''}.{' '}
              <span className="text-[var(--hero-highlight)]">
                See your carrier the way brokers do
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/90">
              {organizationName && <span className="text-white">{organizationName} · </span>}
              Every value comes from FMCSA’s own records and names its source.
            </p>
          </motion.div>

          {only && (
            <motion.div variants={item}>
              <Link
                to={`/portal/carriers/${only.usdot_number}`}
                className="group inline-flex items-center gap-2 rounded-xl bg-[var(--hero-cta)] px-5 py-3 text-sm font-medium text-[var(--hero-cta-ink)] shadow-lg shadow-brand-glow/30 transition-all hover:bg-cta-hover hover:shadow-xl hover:shadow-brand-glow/40 active:bg-cta-active"
              >
                Open {only.legal_name ?? `USDOT ${only.usdot_number}`}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </motion.div>
          )}

          <motion.ul variants={container} className="flex max-w-3xl flex-wrap gap-2">
            {VIEWS.map(({ icon: Icon, label }) => (
              <motion.li
                key={label}
                variants={item}
                className="flex items-center gap-1.5 rounded-full border border-white/25 bg-[var(--hero-fade)] px-3 py-1.5 text-xs text-white backdrop-blur"
              >
                <Icon className="size-3.5 text-white/90" aria-hidden />
                {label}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {carriers?.length === 0 && (
          <motion.div variants={item} className="hidden md:block">
            <ExampleCheck title="What a broker’s check might show" />
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
