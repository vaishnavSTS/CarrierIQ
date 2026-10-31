import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import phoneOverview from '../../assets/phone-overview.webp'
import phoneReport from '../../assets/phone-report.webp'
import phoneSafety from '../../assets/phone-safety.webp'
import { reveal, SectionHeading } from './landingParts'

const SLIDE_SECONDS = 4

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
        <div className="relative mx-auto w-full max-w-[280px] rounded-[2.25rem] bg-slate-900 p-2 shadow-2xl ring-1 ring-black/20 md:order-1">
          <span
            aria-hidden
            className="absolute left-1/2 top-3.5 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-slate-700"
          />
          <div className="overflow-hidden rounded-[1.75rem] bg-white pt-6">
            <div
              className={`flex ${reduceMotion ? '' : 'transition-transform duration-700 ease-in-out'}`}
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
          <span className="absolute right-4 top-9 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
            Sample
          </span>
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
