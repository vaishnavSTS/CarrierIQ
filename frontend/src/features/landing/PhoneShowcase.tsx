import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import phoneOverview from '../../assets/phone-overview.webp'
import phoneReport from '../../assets/phone-report.webp'
import phoneSafety from '../../assets/phone-safety.webp'
import { reveal, SectionHeading } from './landingParts'

const SLIDE_SECONDS = 1

const SCREENS = [
  {
    src: phoneOverview,
    title: 'Your status at a glance',
    text: 'Authority, registration and insurance, each with its FMCSA source.',
    alt: 'The carrier page on a phone: authority, registration and insurance status',
  },
  {
    src: phoneSafety,
    title: 'Your safety record',
    text: 'Safety rating, inspections, crashes and out-of-service rates.',
    alt: 'The Safety tab on a phone: safety rating, inspections, crashes and out-of-service rates',
  },
  {
    src: phoneReport,
    title: 'Your Safety Score Report',
    text: 'Your Estimated ISS and what’s behind it, ready to download as a PDF.',
    alt: 'The Safety Score Report on a phone: the Estimated ISS gauge',
  },
]

/**
 * Real screens of the app, for a made-up carrier, sliding one after the other in a phone frame. It
 * pauses under the pointer or keyboard, stops once someone picks a screen, and doesn't run for
 * people who asked their device for less motion (they pick screens themselves).
 */
export function PhoneShowcase() {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [chosen, setChosen] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (paused || chosen || reduceMotion) return
    const timer = window.setInterval(
      () => setCurrent((i) => (i + 1) % SCREENS.length),
      SLIDE_SECONDS * 1000,
    )
    return () => window.clearInterval(timer)
  }, [paused, chosen, reduceMotion])

  return (
    <section className="pb-20">
      <SectionHeading eyebrow="On your phone" title="Check your carrier from anywhere" />
      <motion.div
        {...reveal()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="mx-auto mt-10 grid max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12"
      >
        <div className="relative mx-auto w-full max-w-[280px] md:order-1">
          {/* A soft brand glow behind a slim gradient frame. */}
          <div
            aria-hidden
            className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-violet-500/40 via-fuchsia-500/25 to-sky-400/30 blur-2xl"
          />
          <div className="relative rounded-[2.25rem] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-violet-700 p-[3px] shadow-2xl shadow-violet-500/30">
            <div className="overflow-hidden rounded-[2.1rem] bg-white">
              <div className="flex h-6 items-center justify-center">
                <span aria-hidden className="h-1.5 w-12 rounded-full bg-slate-300" />
              </div>
              <div
                className={`flex ${reduceMotion ? '' : 'transition-transform duration-500 ease-in-out'}`}
                style={{ transform: `translateX(-${current * 100}%)` }}
              >
                {SCREENS.map(({ src, alt }, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={i === current ? alt : ''}
                    aria-hidden={i !== current}
                    width={780}
                    height={1560}
                    className="h-auto w-full shrink-0"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {SCREENS.map(({ title, text }, i) => (
            <li key={title}>
              <button
                type="button"
                aria-current={i === current}
                onClick={() => {
                  setChosen(true)
                  setCurrent(i)
                }}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  i === current
                    ? 'border-accent/40 bg-accent-soft'
                    : 'border-slate-200 bg-surface/70 hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">{title}</span>
                <span className="mt-1 block text-sm text-slate-600">{text}</span>
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.p {...reveal()} className="mt-6 text-center text-xs text-slate-500">
        Sample screens with example data for a made-up carrier.
      </motion.p>
    </section>
  )
}
