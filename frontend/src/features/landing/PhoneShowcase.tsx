import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import phoneOverview from '../../assets/phone-overview.webp'
import phoneReport from '../../assets/phone-report.webp'
import phoneSafety from '../../assets/phone-safety.webp'
import { reveal, SectionHeading } from './landingParts'

const SLIDE_SECONDS = 2

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
    alt: 'The Inspections tab on a phone: safety rating, inspections, crashes and out-of-service rates',
  },
  {
    src: phoneReport,
    title: 'Your Safety Score Report',
    text: 'Your Estimated ISS and what’s behind it, ready to download as a PDF.',
    alt: 'The Safety Score Report on a phone: the Estimated ISS gauge',
  },
]

/** Where a screen sits: 0 in the phone, 1 waiting to the right, -1 just left to the left. */
function offsetFrom(screen: number, current: number): number {
  return ((screen - current + SCREENS.length + 1) % SCREENS.length) - 1
}

/**
 * Real screens of the app, for a made-up carrier, sliding one after the other in a phone frame, in
 * a loop that never stops. Picking a screen jumps to it and the loop carries on from there. People
 * who asked their device for less motion pick screens themselves.
 */
export function PhoneShowcase() {
  const [{ current, previous }, setPlace] = useState({ current: 0, previous: 0 })
  const show = (next: number) => setPlace((place) => ({ current: next, previous: place.current }))
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    // Restarts on every change, so a picked screen also gets its full time.
    const timer = window.setTimeout(
      () =>
        setPlace((place) => ({
          current: (place.current + 1) % SCREENS.length,
          previous: place.current,
        })),
      SLIDE_SECONDS * 1000,
    )
    return () => window.clearTimeout(timer)
  }, [current, reduceMotion])

  return (
    <section className="pb-20">
      <SectionHeading eyebrow="On your phone" title="Check your carrier from anywhere" />
      <motion.div
        {...reveal()}
        className="mx-auto mt-10 grid max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12"
      >
        <div className="relative mx-auto w-full max-w-[280px] md:order-1">
          <div className="rounded-[2.25rem] border border-slate-300 bg-surface p-1.5 shadow-xl">
            <div className="overflow-hidden rounded-[1.8rem] bg-white">
              <div className="flex h-6 items-center justify-center">
                <span aria-hidden className="h-1.5 w-12 rounded-full bg-slate-300" />
              </div>
              {/* All in one grid cell. The screen crossing from one side to the other does so
                  unseen, so the slide always carries on the same way, past the last to the first. */}
              <div className="grid">
                {SCREENS.map(({ src, alt }, i) => {
                  const offset = offsetFrom(i, current)
                  const crossing = Math.abs(offset - offsetFrom(i, previous)) > 1
                  return (
                    <img
                      key={src}
                      src={src}
                      alt={i === current ? alt : ''}
                      aria-hidden={i !== current}
                      width={780}
                      height={1560}
                      className={`h-auto w-full [grid-area:1/1] ${
                        reduceMotion || crossing
                          ? ''
                          : 'transition-transform duration-500 ease-in-out'
                      }`}
                      style={{ transform: `translateX(${offset * 100}%)` }}
                    />
                  )
                })}
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
                onClick={() => show(i)}
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
