import {
  CircleCheck,
  FileText,
  Gauge,
  Network,
  Search,
  ShieldCheck,
  TrendingDown,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import { AuroraBackdrop } from '../../components/layout/AuroraBackdrop'
import { googleStartUrl } from '../../api/auth'
import { useAuthOptions } from '../../hooks/useAuth'

const ease = [0.16, 1, 0.3, 1] as const

export type Audience = 'client' | 'broker' | 'staff'

interface Benefit {
  icon: LucideIcon
  title: string
  text: string
}

const CLIENT_BENEFITS: Benefit[] = [
  {
    icon: ShieldCheck,
    title: 'See what a broker’s check sees',
    text: 'Authority, insurance, BOC-3 and safety, straight from FMCSA.',
  },
  {
    icon: TrendingDown,
    title: 'Know what to fix',
    text: 'What weighs most in each CSA measure, and what usually helps.',
  },
  {
    icon: FileText,
    title: 'A packet you can send',
    text: 'A dated, sourced carrier packet for brokers and shippers.',
  },
]

/** Clients (carriers) look at their own record; brokers vet carriers before booking them; the
 * STS team works the internal dashboard. */
const PANEL: Record<
  Audience,
  { lead: string; accent: string; intro: string; benefits: Benefit[] }
> = {
  client: {
    lead: 'Understand your carrier',
    accent: 'the way brokers do',
    intro: 'Public FMCSA data, turned into a clear picture and what to do about it.',
    benefits: CLIENT_BENEFITS,
  },
  broker: {
    lead: 'Vet any carrier',
    accent: 'before you book the load',
    intro: 'Public FMCSA data on any carrier, with the source named on every value.',
    benefits: [
      {
        icon: ShieldCheck,
        title: 'Authority and insurance, current',
        text: 'Active MC, insurance and BOC-3 on file, revocations, straight from FMCSA.',
      },
      {
        icon: Gauge,
        title: 'Safety at a glance',
        text: 'Estimated ISS – Safety score, out-of-service rates, crashes and CSA alerts.',
      },
      {
        icon: Network,
        title: 'Fraud red flags',
        text: 'Phones, addresses and VINs shared with other carriers; registration gaps.',
      },
    ],
  },
  staff: {
    lead: 'Carrier intelligence',
    accent: 'for the STS team',
    intro: 'The internal dashboard: every carrier, every signal, every account.',
    benefits: [
      {
        icon: Search,
        title: 'Search and refresh any carrier',
        text: 'Load any USDOT or MC from FMCSA and NHTSA, and see what changed.',
      },
      {
        icon: Network,
        title: 'Review signals with evidence',
        text: 'Shared contacts and VINs, authority and insurance gaps, each with its source.',
      },
      {
        icon: UserCheck,
        title: 'Manage accounts',
        text: 'New client and broker sign-ups, checked against FMCSA; disable or reactivate.',
      },
    ],
  },
}

/**
 * Frame for the login and sign-up forms: a brand panel (large screens) beside the form, on the
 * same grid-and-glow backdrop as the landing page.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  audience = 'client',
  wide = false,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
  /** Which brand panel to show: clients' own record, or brokers vetting carriers. */
  audience?: Audience
  /** More room for the form, so a long one fits with its fields side by side */
  wide?: boolean
}) {
  return (
    <div className="relative overflow-hidden">
      <AuroraBackdrop />

      <div className={`mx-auto px-4 ${wide ? 'max-w-6xl py-6' : 'max-w-5xl py-10 md:py-16'}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className={`grid overflow-hidden rounded-3xl border border-slate-200 bg-surface/80 shadow-2xl backdrop-blur ${wide ? 'lg:grid-cols-[0.7fr_1.3fr]' : 'lg:grid-cols-[1fr_1.05fr]'}`}
        >
          <BrandPanel audience={audience} />

          <section className={`min-w-0 p-4 ${wide ? 'sm:px-10 sm:py-6' : 'sm:p-10'}`}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease }}
            >
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
              <div className="mt-7">{children}</div>
              <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
            </motion.div>
          </section>
        </motion.div>
      </div>
    </div>
  )
}

function BrandPanel({ audience }: { audience: Audience }) {
  const panel = PANEL[audience]
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-700 p-10 lg:flex lg:flex-col">
      <div
        aria-hidden
        className="absolute -right-24 -top-24 size-72 rounded-full bg-fuchsia-400/30 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-28 -left-20 size-72 rounded-full bg-violet-400/30 blur-3xl"
      />

      <div className="relative">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
          {panel.lead}{' '}
          <span className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-300 bg-clip-text text-transparent">
            {panel.accent}
          </span>
        </h2>
        <p className="mt-3 text-sm text-white/85">{panel.intro}</p>
      </div>

      <ul className="relative mt-10 space-y-6">
        {panel.benefits.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.25 + i * 0.1, ease }}
            className="flex gap-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">{title}</span>
              <span className="mt-0.5 block text-sm text-white/85">{text}</span>
            </span>
          </motion.li>
        ))}
      </ul>

      <ul className="relative mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-10 text-xs text-white/85">
        {['Public FMCSA & NHTSA data', 'Source named on every value'].map((point) => (
          <li key={point} className="flex items-center gap-1.5">
            <CircleCheck className="size-3.5 text-emerald-200" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...input}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-canvas/70 px-3.5 py-2.5 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
    >
      {message}
    </p>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-cta px-4 py-3 text-sm font-medium text-cta-ink shadow-lg shadow-brand-glow/30 transition-all hover:bg-cta-hover hover:shadow-xl hover:shadow-brand-glow/40 active:bg-cta-active disabled:opacity-60"
    >
      {busy ? 'Please wait…' : children}
    </button>
  )
}

/** "Continue with Google" plus an "or" divider; hidden when the API has no Google settings. */
/** `portal`: a new Google user finishes signing up as a client (default) or a broker. */
export function GoogleButton({
  label = 'Continue with Google',
  portal = 'client',
}: {
  label?: string
  portal?: 'client' | 'broker'
}) {
  const { data } = useAuthOptions()
  if (!data?.google) return null
  return (
    <>
      <a
        href={googleStartUrl(portal)}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
      >
        <GoogleLogo />
        {label}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
