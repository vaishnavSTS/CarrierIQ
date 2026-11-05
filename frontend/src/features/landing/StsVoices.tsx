import { BadgeCheck, Quote } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { Accent, reveal, SectionHeading } from './landingParts'

/*
 * What Sky Transport Solutions' clients say, word for word from skytransportsolutions.com (its
 * "Testimonials" section, read Nov 4, 2026). They are about STS's compliance services, not about
 * Carrier Safety Scan, and the section says so. Don't add or reword quotes: only real ones, with
 * the customer's permission.
 */
const QUOTES = [
  {
    text: 'Sky Transport Solutions handled our IFTA filings flawlessly. They saved us time and money, allowing us to focus on our routes.',
    from: 'Express Haulers Inc.',
    topic: 'IFTA filings',
  },
  {
    text: 'Navigating the new entrant audit was daunting, but their team guided us through every step. We passed with flying colors!',
    from: 'Patriot Freight',
    topic: 'New entrant audit',
  },
  {
    text: 'Their compliance management is second to none. I can sleep at night knowing our records are in order.',
    from: 'Johnson & Sons Logistics',
    topic: 'Compliance management',
  },
  {
    text: 'The best in the business for a reason. Professional, knowledgeable, and always responsive. Highly recommend!',
    from: 'Apex Cargo Movers',
    topic: 'Service',
  },
]

const SECONDS = 6

export function StsTestimonials({ number }: { number?: string }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useReducedMotion()
  const quote = QUOTES[index]

  useEffect(() => {
    if (reduceMotion || paused) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % QUOTES.length), SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduceMotion])

  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="In their words"
        title={
          <>
            What Sky Transport Solutions’ <Accent>clients say</Accent>
          </>
        }
        aside="Trucking companies on the compliance work of Sky Transport Solutions, the team behind Carrier Safety Scan."
      />
      <motion.div
        {...reveal()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="mt-10 grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]"
      >
        <figure className="relative overflow-hidden rounded-3xl bg-[#101853] p-8 text-white shadow-2xl shadow-brand-glow/20 md:p-10">
          <Quote className="absolute -right-2 -top-2 size-32 text-white/8" aria-hidden />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={quote.from}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
            >
              <span className="font-label inline-flex rounded-full bg-amber-300 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#060d24]">
                {quote.topic}
              </span>
              <blockquote className="relative mt-5 text-xl leading-relaxed md:text-2xl [font-family:var(--font-display)]">
                “{quote.text}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-2 text-sm text-white/85">
                <BadgeCheck className="size-4 text-amber-300" aria-hidden />
                {quote.from}
              </figcaption>
            </motion.div>
          </AnimatePresence>
          <div className="mt-8 flex gap-1.5" role="tablist" aria-label="Testimonials">
            {QUOTES.map((q, i) => (
              <button
                key={q.from}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={q.from}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-amber-300' : 'w-2 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        </figure>

        <ul className="grid gap-3">
          {QUOTES.map((q, i) => (
            <li key={q.from}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`flex h-full w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left ring-1 transition-colors ${
                  i === index
                    ? 'bg-surface text-slate-950 shadow-lg ring-amber-300'
                    : 'bg-surface/70 text-slate-700 ring-slate-200 hover:bg-surface'
                }`}
              >
                <span className="font-semibold">{q.from}</span>
                <span className="text-xs text-slate-500">{q.topic}</span>
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
      <p className="mt-4 text-center text-xs text-slate-500">
        From skytransportsolutions.com. About Sky Transport Solutions’ compliance services.
      </p>
    </div>
  )
}

/** As on skytransportsolutions.com, "We are Proud Members Of" (the memberships only). */
const MEMBERSHIPS = [
  { short: 'IFTA', name: 'International Fuel Tax Agreement' },
  { short: 'IRP', name: 'International Registration Plan' },
  { short: 'NDASA', name: 'National Drug and Alcohol Screening Association' },
  { short: 'BBB', name: 'Better Business Bureau' },
]

/** A strip, moving sideways, of what Sky Transport Solutions is a member of. */
export function MembershipsStrip() {
  const row = (hidden: boolean) => (
    <ul
      className="marquee-row flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {[...MEMBERSHIPS, ...MEMBERSHIPS].map((m, i) => (
        <li key={`${m.short}-${i}`} className="flex items-center gap-3 whitespace-nowrap">
          <span className="grid h-9 min-w-14 place-items-center rounded-lg bg-[#101853] px-2.5 text-sm font-bold tracking-wide text-amber-300">
            {m.short}
          </span>
          <span className="text-sm font-medium text-slate-700">{m.name}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="mt-8">
      <div className="font-label mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Sky Transport Solutions is a proud member of
      </div>
      <section
        aria-label="Sky Transport Solutions memberships"
        className="marquee relative overflow-hidden rounded-2xl border border-slate-200 bg-surface py-4"
      >
        <div className="marquee-track flex w-max">
          {row(false)}
          {row(true)}
        </div>
      </section>
    </div>
  )
}
