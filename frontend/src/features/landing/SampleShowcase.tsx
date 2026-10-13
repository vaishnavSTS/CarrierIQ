import {
  AlertTriangle,
  CircleCheck,
  Download,
  FileText,
  ScrollText,
  ShieldCheck,
  TrendingDown,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Easing } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Landing-page illustration: sample cards of what CarrierIQ shows, one every 3 seconds. Every
 * card is a made-up carrier and labelled SAMPLE; the national OOS averages are FMCSA's published
 * figures. Pauses on hover; holds still for people who prefer reduced motion.
 */

const INTERVAL_MS = 3000
const ease = [0.16, 1, 0.3, 1] as const
// Drop then three shrinking bounces: impacts at 32%, 66% and 88% of the landing.
const BOUNCE_TIMES = [0, 0.32, 0.5, 0.66, 0.78, 0.88, 0.95, 1]
// Falls speed up (easeIn), rises slow down (easeOut).
const BOUNCE_EASE: Easing[] = [
  'easeIn',
  'easeOut',
  'easeIn',
  'easeOut',
  'easeIn',
  'easeOut',
  'easeIn',
]

interface Slide {
  title: string
  icon: LucideIcon
  body: ReactNode
  footer: ReactNode
}

const SLIDES: Slide[] = [
  {
    title: 'What a broker’s check may flag',
    icon: ShieldCheck,
    body: (
      <Rows
        rows={[
          { ok: true, label: 'Operating authority', detail: 'Active · Motus' },
          { ok: true, label: 'Insurance on file', detail: 'Usual renewal: March' },
          { ok: true, label: 'Process agent (BOC-3)', detail: 'On file in Motus' },
          { ok: false, label: 'MCS-150 update', detail: 'Over 2 years old' },
          { ok: true, label: 'Vehicle out-of-service rate', detail: 'Below national average' },
          { ok: false, label: 'Shared phone number', detail: 'Also listed by 1 other carrier' },
        ]}
      />
    ),
    footer: <Note tone="warn">2 items to look at, each with what usually resolves it.</Note>,
  },
  {
    title: 'Out-of-service rates · last 24 months',
    icon: TrendingDown,
    body: (
      <div className="space-y-6 py-1">
        <RateBar label="Vehicle" rate={14.8} national={22.3} inspections={27} />
        <RateBar label="Driver" rate={3.2} national={6.7} inspections={31} />
        <RateBar label="Hazmat" rate={0} national={4.4} inspections={2} />
      </div>
    ),
    footer: (
      <Note tone="ok">Below FMCSA’s national average on all three, counted FMCSA’s way.</Note>
    ),
  },
  {
    title: 'How to improve · Vehicle Maintenance',
    icon: Wrench,
    body: (
      <div className="py-1">
        <div className="text-xs text-slate-500">What weighs most in this CSA measure</div>
        <div className="mt-3 space-y-3">
          <WeightBar label="Brakes" share={41} />
          <WeightBar label="Lighting" share={26} />
          <WeightBar label="Tires" share={15} />
          <WeightBar label="All other groups" share={18} muted />
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-canvas px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-800">What usually helps:</span> pre-trip brake and
          lamp checks (49 CFR 396.13). A wrong record? Ask FMCSA to correct it through DataQs.
        </div>
      </div>
    ),
    footer: <Note tone="info">Fewer brake and lighting violations would lower it most.</Note>,
  },
  {
    title: 'Authority & insurance',
    icon: ScrollText,
    body: (
      <Rows
        rows={[
          { ok: true, label: 'MC 000000 · common', detail: 'Active since 2019' },
          { ok: true, label: 'Liability (BIPD)', detail: '$750,000 on file' },
          { ok: true, label: 'Cargo', detail: '$100,000 on file' },
          { ok: true, label: 'Process agent (BOC-3)', detail: 'Filed in Motus' },
          { ok: true, label: 'Next insurance renewal', detail: 'Usually around March' },
        ]}
      />
    ),
    footer: <Note tone="info">Each line names its FMCSA source: Motus or legacy L&amp;I.</Note>,
  },
  {
    title: 'Carrier packet',
    icon: FileText,
    body: (
      <div className="py-1">
        <div className="grid grid-cols-2 gap-2">
          {[
            'Identity & authority',
            'Insurance & BOC-3',
            'Safety & CSA',
            'Fleet & equipment',
            'Linked carriers',
            'Recent changes',
          ].map((section) => (
            <div
              key={section}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-canvas px-2.5 py-2 text-xs text-slate-700"
            >
              <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
              {section}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent-soft/60 px-3 py-2.5">
          <span className="text-xs text-slate-700">Dated, sourced, no score</span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">
            <Download className="size-3.5" aria-hidden />
            Save as PDF
          </span>
        </div>
      </div>
    ),
    footer: <Note tone="ok">Ready to send to brokers and shippers.</Note>,
  },
]

export function SampleShowcase() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (paused || reduceMotion) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduceMotion])

  const slide = SLIDES[index]
  const Icon = slide.icon

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What CarrierIQ shows, sample cards"
    >
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 blur-2xl"
      />

      {/* Holds the space while one card leaves and the next arrives, so nothing jumps. */}
      <div className="relative min-h-[410px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            // The whole card drops in from above and bounces to rest, each bounce smaller, like a
            // dropped ball (ease-in on the falls, ease-out on the rises); the old one falls away.
            // Squash and stretch: taller while falling, flattened on each impact, springing
            // back as it rises, with a small wobble that settles level.
            initial={{ opacity: 0, y: -140 }}
            animate={{
              opacity: 1,
              y: [-140, 0, -36, 0, -16, 0, -6, 0],
              scaleY: [1.06, 0.88, 1.04, 0.94, 1.02, 0.98, 1, 1],
              scaleX: [0.95, 1.1, 0.98, 1.05, 0.99, 1.02, 1, 1],
              rotate: [-3, 1.5, -1, 0.6, -0.3, 0.2, 0, 0],
              transition: {
                default: { duration: 1.2, times: BOUNCE_TIMES, ease: BOUNCE_EASE },
                opacity: { duration: 0.25 },
              },
            }}
            style={{ transformOrigin: '50% 100%' }} // squash against the "floor"
            exit={{ opacity: 0, y: 70, transition: { duration: 0.28, ease: 'easeIn' } }}
            className="relative flex min-h-[410px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface/95 p-5 shadow-2xl backdrop-blur md:p-6"
            aria-live={paused ? 'polite' : 'off'}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">EXAMPLE FREIGHT LLC</div>
                <div className="font-mono text-xs text-slate-500">USDOT 0000000 · MC 000000</div>
              </div>
              <span className="rounded-md border border-slate-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Sample
              </span>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Icon className="size-3.5 text-accent-strong" aria-hidden />
              {slide.title}
            </div>
            <div className="mt-2 flex flex-1 flex-col justify-center">{slide.body}</div>
            <div className="mt-3">{slide.footer}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Rows({ rows }: { rows: { ok: boolean; label: string; detail: string }[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <motion.li
          key={r.label}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.1 + i * 0.06, ease }}
          className="flex items-center gap-3 py-2.5"
        >
          {r.ok ? (
            <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
          )}
          <span className="flex-1 text-sm text-slate-800">{r.label}</span>
          <span className={`text-right text-xs ${r.ok ? 'text-slate-500' : 'text-amber-700'}`}>
            {r.detail}
          </span>
        </motion.li>
      ))}
    </ul>
  )
}

/** Carrier rate against FMCSA's national average, on a 0-30% scale. */
function RateBar({
  label,
  rate,
  national,
  inspections,
}: {
  label: string
  rate: number
  national: number
  inspections: number
}) {
  const scale = (value: number) => `${Math.min(value / 30, 1) * 100}%`
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-800">{label}</span>
        <span className="text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{rate}%</span> · national {national}% ·{' '}
          {inspections} inspections
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-slate-100">
        <motion.div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700"
          initial={{ width: 0 }}
          animate={{ width: scale(rate) }}
          transition={{ duration: 0.7, delay: 0.15, ease }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded bg-slate-500"
          style={{ left: scale(national) }}
          title={`National average ${national}%`}
        />
      </div>
    </div>
  )
}

function WeightBar({
  label,
  share,
  muted = false,
}: {
  label: string
  share: number
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-28 shrink-0 text-xs ${muted ? 'text-slate-500' : 'text-slate-800'}`}>
        {label}
      </span>
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <motion.div
          className={`h-2 rounded-full ${
            muted ? 'bg-slate-300' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${share}%` }}
          transition={{ duration: 0.7, delay: 0.15, ease }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-500">{share}%</span>
    </div>
  )
}

function Note({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: ReactNode }) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    info: 'bg-accent-soft/60 text-slate-700',
  }
  return <div className={`rounded-lg px-3 py-2 text-xs ${styles[tone]}`}>{children}</div>
}
