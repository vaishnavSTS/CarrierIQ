import { ArrowRight, Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { AUDIENCE_PATH, forgetStoredAudience, type Audience } from '../features/audience/audience'
import { FaqSection } from '../features/landing/Faq'
import { CHOOSER_FAQ } from '../features/landing/faqContent'
import { HeroTryForm } from '../features/landing/LandingSections'
import { LiveStrip } from '../features/landing/LivePulse'
import { Band } from '../features/landing/landingParts'
import { CHOOSER_PHOTO } from '../features/landing/photos'
import { homeFor, useMe } from '../hooks/useAuth'

const CHOICES: {
  audience: Audience
  label: string
  title: string
  text: string
  points: string[]
}[] = [
  {
    audience: 'carrier',
    label: 'Carriers',
    title: 'I’m a carrier',
    text: 'See your company the way brokers do, and know what to fix.',
    points: [
      'What a broker’s check flags',
      'Your Estimated ISS',
      'Violations that weigh most',
      'MCS-150 update due date',
      'DataQs challenges',
    ],
  },
  {
    audience: 'broker',
    label: 'Freight brokers',
    title: 'I’m a freight broker',
    text: 'Vet any carrier before you book the load.',
    points: [
      'Booking check on any carrier',
      'Chameleon check',
      'Shared phones & addresses',
      'Compare up to 3 carriers',
      'Dated Safety Score Report',
    ],
  },
  {
    audience: 'agent',
    label: 'Insurance agents',
    title: 'I’m an insurance agent',
    text: 'Understand a trucking risk before you quote it.',
    points: [
      'Liability, cargo & bond filings',
      'Safety record and crashes',
      'Trucks & trailers by VIN',
      'Expected renewal month',
      'Dated report for the file',
    ],
  },
]

/** How each photo sits in a tall card: the person stays in view above the text. */
const CHOOSER_PHOTO_FIT: Record<Audience, string> = {
  carrier: 'inset-0 size-full object-[42%_30%]',
  broker: 'inset-0 size-full object-[35%_50%]',
  agent: 'inset-0 size-full object-[70%_50%]',
}

/** How long each point shows on a card. */
const POINT_MS = 2600

/**
 * One glass bar per card whose point changes every few seconds, sliding up; all three cards change
 * together. Screen readers get the whole list; with reduced motion the bar stays on the first point.
 */
function CyclingPoint({ points }: { points: string[] }) {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    let timer: number | undefined
    const begin = window.setTimeout(() => {
      setIndex((n) => (n + 1) % points.length)
      timer = window.setInterval(() => setIndex((n) => (n + 1) % points.length), POINT_MS)
    }, POINT_MS)
    return () => {
      window.clearTimeout(begin)
      window.clearInterval(timer)
    }
  }, [points.length, reduceMotion])

  return (
    <span className="mt-4 block">
      <span className="flex items-center gap-2.5 rounded-full bg-white/15 py-1.5 pl-3 pr-3.5 ring-1 ring-white/20 backdrop-blur">
        <Check className="size-4 shrink-0 text-[var(--hero-highlight)]" aria-hidden />
        <span className="sr-only">{points.join(', ')}</span>
        <span aria-hidden className="relative h-5 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false}>
            <motion.span
              key={index}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 truncate text-sm font-medium text-white"
            >
              {points[index]}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </span>
  )
}

/**
 * The front door: the visitor says whether they're a carrier, a freight broker or an insurance
 * agent, and lands on that page. Asked on every visit (nothing is stored); someone logged in goes
 * to their portal.
 */
export function AudienceChooserPage() {
  const { data: user } = useMe()
  const navigate = useNavigate()
  useEffect(forgetStoredAudience, [])
  // The choices show straight away, without waiting on the login check: when the API is waking
  // up that check can take most of a minute, and the page used to stay empty until it answered.
  if (user) return <Navigate to={homeFor(user.portal)} replace />

  const choose = (audience: Audience) => navigate(AUDIENCE_PATH[audience])

  return (
    <>
      <div className="hero-gradient">
        <section className="mx-auto max-w-6xl px-4 pb-24 pt-10 md:pt-14">
          {/* A small "Welcome to" over the name in gold, then the invitation in the serif italic. */}
          <h1 className="text-center font-semibold">
            <span className="font-label block text-sm uppercase tracking-[0.3em] text-white/90 md:text-base">
              Welcome to
            </span>
            <span className="mt-2 block text-4xl text-[var(--hero-highlight)] md:text-5xl lg:text-6xl">
              Carrier Safety Scan
            </span>
          </h1>
          {/* .font-accent sizes itself from its parent, so the size is set on the paragraph. */}
          <p className="mx-auto mt-4 max-w-4xl text-center text-lg leading-snug text-white/90 md:text-xl">
            <span className="font-accent">
              Try a free carrier search, or choose an option below to see what Carrier Safety Scan
              does for you.
            </span>
          </p>

          {/* The free search, high enough to be seen without scrolling. */}
          <div className="mt-7">
            <HeroTryForm centered chips={false} note={false} />
          </div>

          <LiveStrip />

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {/* Shown at once (no fade-in): choosing is the whole page. */}
            {CHOICES.map(({ audience, label, title, text, points }, i) => (
              <button
                key={audience}
                type="button"
                onClick={() => choose(audience)}
                className="group relative flex h-[24rem] flex-col justify-end overflow-hidden rounded-3xl text-left shadow-2xl shadow-black/30 ring-1 ring-white/25 transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--hero-highlight)]"
              >
                <img
                  src={CHOOSER_PHOTO[audience].src}
                  alt={CHOOSER_PHOTO[audience].alt}
                  className={`absolute object-cover transition-transform duration-700 ease-out group-hover:scale-110 ${CHOOSER_PHOTO_FIT[audience]}`}
                />
                {/* Dark from the bottom up, so the white text on the photo stays readable. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-[#060d24] via-[#060d24]/70 via-45% to-[#060d24]/0"
                />
                <span className="font-label absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#060d24] shadow">
                  {String(i + 1).padStart(2, '0')} · {label}
                </span>
                <span className="relative flex flex-col p-6">
                  <span className="text-2xl font-semibold text-white [font-family:var(--font-display)]">
                    {title}
                  </span>
                  <span className="mt-2 text-sm leading-relaxed text-white/85">{text}</span>
                  <CyclingPoint points={points} />
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                    Continue
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-center text-sm text-white/90">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {['30 days free', 'No card needed to start', 'Cancel any time'].map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <Check className="size-4 text-[var(--hero-highlight)]" aria-hidden />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
      <Band tone="mesh">
        <FaqSection
          items={CHOOSER_FAQ}
          title="New to Carrier Safety Scan?"
          aside="What it is, who it’s for and how to try it."
        />
      </Band>
    </>
  )
}
