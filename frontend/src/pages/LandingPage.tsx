import {
  ArrowRight,
  Briefcase,
  CircleCheck,
  FileText,
  Network,
  Search,
  ShieldCheck,
  TrendingDown,
  Truck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AuroraBackdrop } from '../components/layout/AuroraBackdrop'
import { SampleShowcase } from '../features/landing/SampleShowcase'
import { homeFor, useMe } from '../hooks/useAuth'

const ease = [0.16, 1, 0.3, 1] as const

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease },
})

/** Fades in once when scrolled into view. */
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease },
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
    text: 'A dated, sourced carrier packet to share with brokers and shippers. Facts from FMCSA, and estimates that follow FMCSA’s own published methods.',
  },
]

const FACTS = [
  { value: '20+', label: 'public FMCSA & NHTSA datasets' },
  { value: '6', label: 'views of every carrier' },
  { value: '1–100', label: 'Estimated ISS, by FMCSA’s published method' },
]

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UserPlus,
    title: 'Sign up with your USDOT',
    text: 'Your company, mobile number and USDOT number, or continue with Google. Your portal opens right away.',
  },
  {
    icon: Search,
    title: 'See what brokers see',
    text: 'Authority, insurance, safety and registration checks from FMCSA’s own records, each with its source.',
  },
  {
    icon: FileText,
    title: 'Fix it and share it',
    text: 'Work through what weighs most in your CSA measures, then send brokers a dated carrier packet.',
  },
]

export function LandingPage() {
  const { data: user } = useMe()

  return (
    <div className="relative overflow-hidden">
      {/* Aurora glow and film grain behind the hero; decorative only. */}
      <AuroraBackdrop className="inset-x-0 top-0 h-[900px]" />

      <div className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="text-center lg:text-left">
            <motion.h1
              {...rise(0)}
              className="text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950 md:text-5xl lg:text-[3.4rem]"
            >
              Understand your carrier{' '}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-400 bg-clip-text text-transparent">
                the way brokers do
              </span>
            </motion.h1>
            <motion.p
              {...rise(0.1)}
              className="mx-auto mt-5 max-w-xl text-base text-slate-600 md:text-lg lg:mx-0"
            >
              CarrierSafetyScan turns public FMCSA data into a clear picture of a carrier’s
              authority, insurance, safety and registration health, and explains what to do about
              it.
            </motion.p>

            <motion.div
              {...rise(0.2)}
              className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start"
            >
              {user ? (
                <PrimaryLink to={homeFor(user.portal)}>
                  Open {user.portal === 'internal' ? 'the dashboard' : 'my portal'}
                </PrimaryLink>
              ) : (
                <>
                  <PrimaryLink to="/register">Create a client account</PrimaryLink>
                  <Link
                    to="/login"
                    className="rounded-xl border border-slate-300 bg-surface/60 px-5 py-3 text-sm font-medium text-slate-900 backdrop-blur transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    Log in
                  </Link>
                </>
              )}
            </motion.div>

            <motion.ul
              {...rise(0.3)}
              className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-600 lg:justify-start"
            >
              {[
                'Public FMCSA & NHTSA data',
                'Source named on every value',
                'Evidence, not a score',
              ].map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                  {point}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="mx-auto w-full max-w-md lg:mt-8 lg:max-w-none"
          >
            <SampleShowcase />
          </motion.div>
        </section>

        {/* Facts */}
        <motion.section
          {...reveal()}
          className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-surface/60 py-6 backdrop-blur"
        >
          {FACTS.map((f) => (
            <div key={f.label} className="px-3 text-center">
              <div className="bg-gradient-to-b from-slate-950 to-slate-600 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
                {f.value}
              </div>
              <div className="mt-1 text-xs text-slate-500 md:text-sm">{f.label}</div>
            </div>
          ))}
        </motion.section>

        {/* Who it's for (logged-in users already have the button in the hero) */}
        {!user && (
          <section className="py-20">
            <SectionHeading eyebrow="Who it’s for" title="One login, the right portal" />
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <motion.article
                {...reveal(0)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-accent/50 bg-surface/90 p-7 shadow-[0_0_40px_rgba(139,92,246,0.15)]"
              >
                <div
                  aria-hidden
                  className="absolute -right-16 -top-16 size-48 rounded-full bg-violet-500/20 blur-3xl transition-opacity group-hover:opacity-80"
                />
                <IconBadge icon={Truck} />
                <h3 className="mt-5 text-lg font-semibold text-slate-900">I’m an STS client</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  Create an account with your company and USDOT number and your portal opens right
                  away: your carrier’s profile, what to improve, and a packet to send brokers.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <PrimaryLink to="/register" small>
                    Create a client account
                  </PrimaryLink>
                  <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900">
                    Already have one? <span className="font-medium underline">Log in</span>
                  </Link>
                </div>
              </motion.article>
              <motion.article
                {...reveal(0.05)}
                className="flex flex-col rounded-2xl border border-slate-200 bg-surface/90 p-7"
              >
                <IconBadge icon={Briefcase} />
                <h3 className="mt-5 text-lg font-semibold text-slate-900">I’m a freight broker</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  Sign up with your brokerage’s MC number and vet any carrier: authority, insurance,
                  safety and Estimated ISS, and the registration checks behind fraud screens.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <PrimaryLink to="/broker/register" small>
                    Create a broker account
                  </PrimaryLink>
                  <Link to="/broker/login" className="text-sm text-slate-600 hover:text-slate-900">
                    Already have one? <span className="font-medium underline">Log in</span>
                  </Link>
                </div>
              </motion.article>
              <motion.article
                {...reveal(0.1)}
                className="flex flex-col rounded-2xl border border-slate-200 bg-surface/90 p-7"
              >
                <IconBadge icon={Users} />
                <h3 className="mt-5 text-lg font-semibold text-slate-900">I’m on the STS team</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  Log in with your STS account to open the internal dashboard: search any carrier,
                  review signals with their evidence, and manage data refreshes.
                </p>
                <div className="mt-6">
                  <Link
                    to="/team/login"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    STS team login
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </motion.article>
            </div>
          </section>
        )}

        {/* Features */}
        <section className="pb-20">
          <SectionHeading eyebrow="What you get" title="Everything a broker checks, explained" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon, title, text }, i) => (
              <motion.article
                key={title}
                {...reveal(i * 0.08)}
                className="group rounded-2xl border border-slate-200 bg-surface/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-[0_12px_40px_rgba(139,92,246,0.18)]"
              >
                <IconBadge icon={icon} />
                <h3 className="mt-5 text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="pb-20">
          <SectionHeading eyebrow="How it works" title="From sign-up to a packet in minutes" />
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <motion.li key={title} {...reveal(i * 0.1)}>
                <div className="flex items-center gap-3">
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.4)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-accent-strong">
                    Step {i + 1}
                  </span>
                  {/* Connector: starts after the label and runs across the gap (-mr-6 = the
                      grid's gap-6) to the next step's icon. */}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className="-mr-6 ml-1 hidden h-0.5 flex-1 rounded-full bg-gradient-to-r from-violet-500/80 via-fuchsia-500/60 to-violet-500/80 md:block"
                    />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Closing call to action */}
        {!user && (
          <motion.section
            {...reveal()}
            className="relative mb-20 overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-br from-violet-700/40 via-surface to-fuchsia-700/30 px-6 py-12 text-center md:px-12"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl"
            />
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              See your carrier the way brokers do
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600 md:text-base">
              Create your account with your USDOT number and your portal opens straight away.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <PrimaryLink to="/register">Create a client account</PrimaryLink>
              <Link
                to="/login"
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
              >
                Log in
              </Link>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  )
}

function PrimaryLink({
  to,
  small = false,
  children,
}: {
  to: string
  small?: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-medium text-white shadow-[0_8px_30px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_10px_40px_rgba(139,92,246,0.5)] hover:brightness-110 ${
        small ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm'
      }`}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-11 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent-strong">
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div {...reveal()} className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
        {title}
      </h2>
    </motion.div>
  )
}
