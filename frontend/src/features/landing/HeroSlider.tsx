import { ChevronLeft, ChevronRight, CircleCheck } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { homeFor, useMe } from '../../hooks/useAuth'
import { PrimaryLink } from './landingParts'
import { HeroTryForm } from './LandingSections'
import { SampleShowcase, type ShowcaseAudience } from './SampleShowcase'

const INTERVAL_MS = 3000
const SWIPE_PX = 50

const highlight = (text: string) => <span className="text-[var(--hero-highlight)]">{text}</span>

const PAGES: {
  audience: ShowcaseAudience
  tab: string
  title: ReactNode
  text: string
}[] = [
  {
    audience: 'carrier',
    tab: 'For carriers',
    title: <>See your carrier {highlight('the way brokers do')}, and know exactly what to fix</>,
    text: 'CarrierSafetyScan turns public FMCSA data into a clear picture of a carrier’s authority, insurance, safety and registration health, and explains what to do about it.',
  },
  {
    audience: 'broker',
    tab: 'For brokers',
    title: (
      <>Vet any carrier {highlight('before you book the load')}, and spot the red flags early</>
    ),
    text: 'Check a carrier’s authority, insurance and safety record in one place, see the carriers it shares a phone, address or officer with, and compare up to 3 side by side.',
  },
  {
    audience: 'agent',
    tab: 'For insurance agents',
    title: <>Understand a trucking risk {highlight('before you quote it')}</>,
    text: 'Look up any carrier’s insurance filings, authority, safety record, crashes and fleet from public FMCSA data, and save a dated Safety Score Report for your file.',
  },
]

/** Where a page sits: 0 on screen, 1 waiting to the right, -1 just left to the left. */
function offsetFrom(page: number, current: number, count: number): number {
  return ((page - current + count + 1) % count) - 1
}

/** The homepage's opening: one full page each for carriers, brokers and insurance agents. */
export function HeroSlider() {
  const { data: user } = useMe()
  const [{ index, previous }, setPlace] = useState({ index: 0, previous: 0 })
  const [typing, setTyping] = useState(false)
  const touchStart = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()
  const count = PAGES.length
  const go = (next: number) =>
    setPlace((place) => ({ index: (next + count) % count, previous: place.index }))
  const paused = typing || reduceMotion

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(
      () => setPlace((place) => ({ index: (place.index + 1) % count, previous: place.index })),
      INTERVAL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [index, paused, count])

  const arrow =
    'absolute top-1/2 z-20 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/40 backdrop-blur transition-colors hover:bg-white/25 2xl:grid'

  return (
    <div
      className="relative touch-pan-y"
      aria-roledescription="carousel"
      aria-label="Who CarrierSafetyScan is for"
      onFocus={(e) => setTyping(e.target instanceof HTMLInputElement)}
      onBlur={() => setTyping(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return
        const moved = e.changedTouches[0].clientX - touchStart.current
        touchStart.current = null
        if (Math.abs(moved) >= SWIPE_PX) go(index + (moved < 0 ? 1 : -1))
      }}
    >
      <div
        role="tablist"
        aria-label="Choose who you are"
        className="relative z-20 mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-4 pt-8 lg:justify-start"
      >
        {PAGES.map((page, i) => (
          <button
            key={page.audience}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => go(i)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-white/50 transition-colors ${
              i === index
                ? 'bg-[var(--hero-cta)] text-[var(--hero-cta-ink)]'
                : 'text-white hover:bg-white/15'
            }`}
          >
            {page.tab}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Previous page"
        onClick={() => go(index - 1)}
        className={`${arrow} left-6`}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Next page"
        onClick={() => go(index + 1)}
        className={`${arrow} right-6`}
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>

      <div className="overflow-hidden">
        {/* All in one grid cell, so the tallest page sets the height and nothing jumps. */}
        <div className="grid">
          {PAGES.map((page, i) => {
            const Heading = i === 0 ? 'h1' : 'h2' // one h1 on the page
            const offset = offsetFrom(i, index, count)
            // The page crossing from one side to the other does so unseen, so the slide always
            // carries on in the same direction, past the last page into the first.
            const crossing = Math.abs(offset - offsetFrom(i, previous, count)) > 1
            return (
              <div
                key={page.audience}
                className={`w-full [grid-area:1/1] ${
                  reduceMotion || crossing ? '' : 'transition-transform duration-700 ease-out'
                }`}
                style={{ transform: `translateX(${offset * 100}%)` }}
                inert={i !== index}
              >
                <section className="mx-auto grid max-w-6xl items-center gap-12 relative z-10 px-4 pb-64 pt-8 md:pt-10 lg:pt-14 lg:grid-cols-[1.05fr_1fr]">
                  <div className="text-center lg:text-left">
                    <Heading className="text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-[3.4rem]">
                      {page.title}
                    </Heading>
                    <p className="mx-auto mt-5 max-w-xl text-base text-white/90 md:text-lg lg:mx-0">
                      {page.text}
                    </p>

                    <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start [&_a]:ring-2 [&_a]:ring-white/70">
                      {user ? (
                        <PrimaryLink to={homeFor(user.portal)}>
                          Open {user.portal === 'internal' ? 'the dashboard' : 'my portal'}
                        </PrimaryLink>
                      ) : (
                        <div className="w-full space-y-4">
                          <HeroTryForm />
                        </div>
                      )}
                    </div>

                    <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-white/90 lg:justify-start">
                      {['Public FMCSA & NHTSA data', 'Source named on every value'].map((point) => (
                        <li key={point} className="flex items-center gap-1.5">
                          <CircleCheck className="size-4 text-white" aria-hidden />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mx-auto mt-14 w-full max-w-md lg:mt-8 lg:max-w-none">
                    <SampleShowcase audience={page.audience} active={i === index} />
                  </div>
                </section>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
