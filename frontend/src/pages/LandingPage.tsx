import {
  ArrowRight,
  FileText,
  Network,
  ShieldCheck,
  TrendingDown,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { homeFor, useMe } from '../hooks/useAuth'

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
})

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ShieldCheck,
    title: 'See what a broker’s check sees',
    text: 'Authority, insurance, BOC-3, safety and inspection history from FMCSA, in one place, with the source named on every value.',
  },
  {
    icon: TrendingDown,
    title: 'Know what to fix',
    text: 'Which violation groups weigh most in each CSA BASIC, the 49 CFR rule behind them, and how DataQs corrections work.',
  },
  {
    icon: Network,
    title: 'Catch registration problems early',
    text: 'Motus and legacy L&I gaps, stale MCS-150 updates, shared addresses or phones that can trip a broker’s fraud screen.',
  },
  {
    icon: FileText,
    title: 'A packet you can send',
    text: 'A dated, sourced carrier packet to share with brokers and shippers. Evidence, not a black-box score.',
  },
]

export function LandingPage() {
  const { data: user } = useMe()

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-14 text-center md:py-20">
        <motion.h1
          {...rise(0)}
          className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl"
        >
          Understand your carrier the way brokers do
        </motion.h1>
        <motion.p
          {...rise(0.2)}
          className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg"
        >
          CarrierIQ turns public FMCSA data into a clear picture of a carrier’s authority,
          insurance, safety and registration health, and explains what to do about it.
        </motion.p>
        {user ? (
          <motion.div {...rise(0.3)} className="mt-8 flex justify-center">
            <Link
              to={homeFor(user.portal)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Open {user.portal === 'internal' ? 'the dashboard' : 'my portal'}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </motion.div>
        ) : (
          <motion.div
            {...rise(0.3)}
            className="mx-auto mt-10 grid max-w-4xl gap-4 text-left md:grid-cols-2"
          >
            <article className="flex flex-col rounded-2xl border border-accent/60 bg-surface/90 p-6 shadow-[0_0_24px_rgba(139,92,246,0.18)]">
              <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-strong">
                <Truck className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold text-slate-900">I’m an STS client</h2>
              <p className="mt-1.5 flex-1 text-sm text-slate-600">
                Create an account with your company and USDOT number and your portal opens right
                away: your carrier’s profile, what to improve, and a packet to send brokers.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Create a client account
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">
                  Already have one? <span className="font-medium underline">Log in</span>
                </Link>
              </div>
            </article>
            <article className="flex flex-col rounded-2xl border border-slate-200 bg-surface/90 p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-strong">
                <Users className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold text-slate-900">I’m on the STS team</h2>
              <p className="mt-1.5 flex-1 text-sm text-slate-600">
                Log in with your STS account to open the internal dashboard: search any carrier,
                review signals with their evidence, and manage data refreshes.
              </p>
              <div className="mt-5">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  STS team login
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </article>
          </motion.div>
        )}
      </section>

      <motion.section {...rise(0.4)} className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-surface/80 p-5">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-strong">
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-1.5 text-sm text-slate-600">{text}</p>
          </article>
        ))}
      </motion.section>
    </div>
  )
}
