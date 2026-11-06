import { ArrowRight, Check, CircleCheck, Info } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { AUDIENCE_PATH, type Audience } from '../features/audience/audience'
import { FaqSection } from '../features/landing/Faq'
import { HERO_PHOTO } from '../features/landing/photos'
import {
  Band,
  OnDark,
  reveal,
  SectionHeading,
  type BandTone,
} from '../features/landing/landingParts'

/** The portal's sections take these backgrounds in turn (all light: their text is dark). */
const SECTION_TONES: BandTone[] = ['plain', 'warm', 'grid', 'tint', 'mesh', 'dots']
import { TOURS } from '../features/portal-tour/tourContent'
import { TourVisual } from '../features/portal-tour/TourVisuals'
import { homeFor, useMe } from '../hooks/useAuth'

const AUDIENCE_NAME: Record<Audience, string> = {
  carrier: 'carriers',
  broker: 'brokers',
  agent: 'insurance agents',
}

/**
 * One portal, page by page (/for-carriers/portal, /for-brokers/portal,
 * /for-insurance-agents/portal): every part of it with a sample screen, the plan and the common
 * questions. The words are in features/portal-tour/tourContent.tsx.
 */
export function PortalTourPage({ audience }: { audience: Audience }) {
  const tour = TOURS[audience]
  const { data: user } = useMe()
  const active = useActiveSection(tour.sections.map((s) => s.id))

  const goTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="relative overflow-hidden">
      {/* Hero */}
      <div className="hero-gradient">
        <div className="relative">
          <div
            aria-hidden
            className="hero-photo pointer-events-none absolute inset-x-0 top-0 h-[85%]"
          >
            <img
              src={HERO_PHOTO[audience]}
              alt=""
              className="size-full select-none object-cover object-[50%_60%]"
            />
            <div className="hero-photo-tint absolute inset-0" />
            <div className="hero-photo-scrim absolute inset-0" />
          </div>
          <OnDark>
            <section className="relative z-10 mx-auto max-w-6xl px-4 pb-28 pt-14 md:pb-36 md:pt-20">
              <Link to={AUDIENCE_PATH[audience]} className="text-sm text-white/80 hover:text-white">
                ← Carrier Safety Scan for {AUDIENCE_NAME[audience]}
              </Link>
              <p className="font-label mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hero-highlight)]">
                {tour.eyebrow}
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] text-white md:text-5xl lg:text-6xl">
                {tour.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base text-white/90 md:text-lg">{tour.text}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                {user ? (
                  <Link
                    to={homeFor(user.portal)}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-[#060d24] shadow-lg transition-colors hover:bg-amber-300"
                  >
                    Open my portal
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : (
                  <>
                    <Link
                      to={tour.signUp.to}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-[#060d24] shadow-lg transition-colors hover:bg-amber-300"
                    >
                      {tour.signUp.label}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <Link
                      to="/try"
                      className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/60 transition-colors hover:bg-white/10"
                    >
                      Free trial
                    </Link>
                  </>
                )}
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
                {[
                  '30 days free',
                  'No card needed to start',
                  'Cancel any time',
                  'Works on your phone',
                ].map((fact) => (
                  <li key={fact} className="flex items-center gap-2">
                    <Check className="size-4 text-[var(--hero-highlight)]" aria-hidden />
                    {fact}
                  </li>
                ))}
              </ul>
            </section>
          </OnDark>
        </div>
      </div>

      {/* The section menu: follows the page and shows where you are. */}
      <nav
        aria-label="Parts of the portal"
        className="sticky top-[97px] z-20 border-y border-slate-200 bg-canvas/90 backdrop-blur sm:top-[101px]"
      >
        {/* Wide screens: every part on show (two rows if needed). Narrower: one row that scrolls,
            faded at the right edge so it's clear there's more. */}
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none] lg:flex-wrap lg:justify-center lg:overflow-visible lg:[mask-image:none]">
          {tour.sections.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={active === s.id ? 'true' : undefined}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active === s.id
                    ? 'bg-slate-900 font-medium text-canvas'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="font-label mr-1.5 text-[11px] opacity-60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.nav}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Every part of the portal */}
      {tour.sections.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          className={`band scroll-mt-40 py-16 md:py-24 band-${SECTION_TONES[i % SECTION_TONES.length]}`}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2 lg:gap-16">
            <motion.div {...reveal()} className={i % 2 ? 'lg:order-2' : ''}>
              <p className="font-label flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                <span aria-hidden className="h-px w-8 bg-current" />
                {String(i + 1).padStart(2, '0')} · {s.nav}
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-[1.1] text-slate-950 md:text-4xl">
                {s.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">{s.lead}</p>
              <ul className="mt-6 space-y-3">
                {s.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              {s.note && (
                <p className="mt-6 flex gap-2.5 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <Info className="mt-px size-4 shrink-0 text-sky-600" aria-hidden />
                  {s.note}
                </p>
              )}
            </motion.div>
            <div className={i % 2 ? 'lg:order-1' : ''}>
              <TourVisual visual={s.visual} />
            </div>
          </div>
        </section>
      ))}

      {/* The plan */}
      <Band tone="dark">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <SectionHeading eyebrow="The plan" title="One plan, everything on this page" />
          <motion.div
            {...reveal(0.1)}
            className="rounded-3xl bg-white/95 p-8 text-[#060d24] shadow-2xl"
          >
            <div className="text-sm font-medium text-[#3e4966]">Start with</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-semibold">30 days</span>
              <span className="text-[#3e4966]">free</span>
            </div>
            <ul className="mt-6 space-y-2.5 text-sm">
              {[
                'Every part of the portal shown above',
                'No card needed to start the free month',
                'Cancel any time from your portal',
                'Your invoices in your portal',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            {!user && (
              <Link
                to={tour.signUp.to}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#101853] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e3a8a]"
              >
                {tour.signUp.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </motion.div>
        </div>
      </Band>

      {/* Questions */}
      <Band tone="tint">
        <FaqSection items={tour.faqs} />
      </Band>

      {!user && (
        <Band tone="dots">
          <motion.div
            {...reveal()}
            className="band-dark relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-2xl md:px-12"
          >
            <h2 className="text-3xl font-semibold text-white md:text-4xl">
              Try it on a real carrier
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-white/80 md:text-base">
              One free search, no account needed. Or create your account and get 30 days free.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/try"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-[#060d24] shadow-lg transition-colors hover:bg-amber-300"
              >
                Free trial
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to={tour.signUp.to}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/50 transition-colors hover:bg-white/10"
              >
                {tour.signUp.label}
              </Link>
            </div>
          </motion.div>
        </Band>
      )}
    </div>
  )
}

/** The section nearest the top of the screen, for the section menu. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const first = key.split(',').find((id) => seen.get(id))
        if (first) setActive(first)
      },
      { rootMargin: '-160px 0px -55% 0px' },
    )
    for (const id of key.split(',')) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])
  return active
}
