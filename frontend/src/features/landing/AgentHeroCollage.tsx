import { CalendarClock, CarFront, ShieldCheck, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { MINIMUMS } from './HeroTools'
import { CHOOSER_PHOTO } from './photos'

const ease = [0.16, 1, 0.3, 1] as const
const SECONDS = 5

/*
 * The insurance agent hero's picture: a real photo of an agent with a client, with three small
 * cards floating over it, the facts an agent checks before quoting. They turn through made-up
 * carriers (labelled as samples). Below the search, the federal liability minimums (49 CFR 387).
 */

type Fact = { icon: LucideIcon; label: string; value: string; note: string }

const SAMPLES: { name: string; facts: [Fact, Fact, Fact] }[] = [
  {
    name: 'Example Freight LLC',
    facts: [
      {
        icon: ShieldCheck,
        label: 'Liability on file',
        value: '$1,000,000',
        note: '$750,000 required',
      },
      {
        icon: CalendarClock,
        label: 'Expected renewal',
        value: 'March',
        note: 'Estimate from past filings',
      },
      { icon: CarFront, label: 'Crashes, 24 months', value: '1', note: '0 fatal' },
    ],
  },
  {
    name: 'Sample Hauling Co',
    facts: [
      {
        icon: ShieldCheck,
        label: 'Liability on file',
        value: '$750,000',
        note: 'Meets the minimum only',
      },
      {
        icon: CalendarClock,
        label: 'Expected renewal',
        value: 'Within 30 days',
        note: 'Estimate from past filings',
      },
      { icon: CarFront, label: 'Crashes, 24 months', value: '0', note: 'Only 2 inspections' },
    ],
  },
  {
    name: 'Demo Lines Inc',
    facts: [
      {
        icon: ShieldCheck,
        label: 'Liability on file',
        value: '$5,000,000',
        note: 'Hazmat carrier',
      },
      {
        icon: CalendarClock,
        label: 'Expected renewal',
        value: 'August',
        note: 'Estimate from past filings',
      },
      { icon: CarFront, label: 'Crashes, 24 months', value: '3', note: '0 fatal' },
    ],
  },
]

/** Where each card floats over the photo. */
const SPOTS = [
  'left-0 top-10 -translate-x-1/4 lg:-translate-x-1/3',
  'right-0 top-1/2 translate-x-[12%] -translate-y-1/2',
  'bottom-10 left-6 -translate-x-[10%]',
]

function FactCard({ fact, delay }: { fact: Fact; delay: number }) {
  const Icon = fact.icon
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface/95 px-4 py-3 shadow-2xl shadow-black/30 ring-1 ring-white/60 backdrop-blur">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-amber-300">
        <Icon className="size-5" aria-hidden />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={fact.value + fact.note}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, delay, ease }}
          className="min-w-[9.5rem]"
        >
          <div className="font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {fact.label}
          </div>
          <div className="text-lg font-semibold leading-tight text-slate-950">{fact.value}</div>
          <div className="text-[11px] text-slate-500">{fact.note}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export function AgentHeroCollage() {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const sample = SAMPLES[index]

  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SAMPLES.length), SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [index, reduceMotion])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, ease }}
      className="relative mx-auto w-full max-w-md lg:max-w-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-2xl shadow-black/40 ring-1 ring-white/25 sm:aspect-[5/5] lg:aspect-[4/5]">
        <img
          src={CHOOSER_PHOTO.agent.src}
          alt={CHOOSER_PHOTO.agent.alt}
          className="size-full object-cover object-[70%_50%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#060d24]/70 via-transparent to-[#060d24]/20"
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-end px-5 pb-4 text-white">
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] ring-1 ring-white/30">
            Sample carriers · example data
          </span>
        </div>
      </div>

      {sample.facts.map((fact, i) => (
        <motion.div
          key={fact.label}
          animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }}
          className={`absolute hidden sm:block ${SPOTS[i]}`}
        >
          <FactCard fact={fact} delay={i * 0.08} />
        </motion.div>
      ))}
    </motion.div>
  )
}

/** A slim strip: pick the kind of carrier, see the federal liability minimum. */
export function MinimumStrip() {
  const [key, setKey] = useState<(typeof MINIMUMS)[number]['key']>('general')
  const pick = MINIMUMS.find((m) => m.key === key) ?? MINIMUMS[0]
  return (
    <div className="mt-6 rounded-2xl bg-white/10 p-3 text-left ring-1 ring-white/20 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-label text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--hero-highlight)]">
          Federal liability minimum
        </span>
        <span className="text-xl font-semibold tabular-nums text-white [font-family:var(--font-display)]">
          ${pick.amount.toLocaleString('en-US')}
        </span>
      </div>
      <div role="radiogroup" aria-label="Kind of carrier" className="mt-2 flex flex-wrap gap-1.5">
        {MINIMUMS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={m.key === key}
            onClick={() => setKey(m.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
              m.key === key
                ? 'bg-white text-[#101853] ring-white'
                : 'text-white ring-white/35 hover:bg-white/10'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/75">{pick.detail} · 49 CFR 387</p>
    </div>
  )
}
