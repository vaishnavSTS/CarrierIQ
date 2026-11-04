import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { AUDIENCE_PATH, forgetStoredAudience, type Audience } from '../features/audience/audience'
import { CHOOSER_PHOTO } from '../features/landing/photos'
import { homeFor, useMe } from '../hooks/useAuth'

const CHOICES: {
  audience: Audience
  label: string
  title: string
  text: string
  points: string[]
  /** Which part of the photo stays in a tall card */
  focus: string
}[] = [
  {
    audience: 'carrier',
    label: 'Carriers',
    title: 'I’m a carrier',
    text: 'See your company the way brokers do, and know what to fix.',
    points: ['What a broker’s check would flag', 'Your Estimated ISS', 'DataQs challenges'],
    focus: 'object-[78%_50%]',
  },
  {
    audience: 'broker',
    label: 'Freight brokers',
    title: 'I’m a freight broker',
    text: 'Vet any carrier before you book the load.',
    points: ['A booking check on every carrier', 'Chameleon check', 'Compare up to 3'],
    focus: 'object-[35%_50%]',
  },
  {
    audience: 'agent',
    label: 'Insurance agents',
    title: 'I’m an insurance agent',
    text: 'Understand a trucking risk before you quote it.',
    points: ['Filings and authority', 'Safety record and crashes', 'Fleet by VIN'],
    focus: 'object-[70%_50%]',
  },
]

/**
 * The front door: the visitor says whether they're a carrier, a freight broker or an insurance
 * agent, and lands on that page. Asked on every visit (nothing is stored); someone logged in goes
 * to their portal. Three tall photo cards; on a wide screen the one under the mouse widens.
 */
export function AudienceChooserPage() {
  const { data: user, isPending } = useMe()
  const navigate = useNavigate()
  useEffect(forgetStoredAudience, [])
  if (isPending) return null
  if (user) return <Navigate to={homeFor(user.portal)} replace />

  const choose = (audience: Audience) => navigate(AUDIENCE_PATH[audience])

  return (
    <div className="hero-gradient">
      <section className="mx-auto max-w-6xl px-4 pb-24 pt-14 md:pt-20">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div>
            <p className="font-label text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hero-highlight)]">
              Welcome
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.05] text-white md:text-6xl">
              Welcome to{' '}
              <span className="font-accent text-[var(--hero-highlight)]">Carrier Safety Scan</span>
            </h1>
          </div>
          <p className="text-base text-white/85 md:text-lg">
            Tell us who you are and we’ll show you what matters to you.
          </p>
        </div>

        {/* Shown at once (no fade-in): choosing is the whole page. */}
        <div className="mt-12 flex flex-col gap-4 lg:h-[30rem] lg:flex-row">
          {CHOICES.map(({ audience, label, title, text, points, focus }, i) => (
            <button
              key={audience}
              type="button"
              onClick={() => choose(audience)}
              className="group relative flex h-[26rem] flex-col justify-end overflow-hidden rounded-3xl text-left shadow-2xl shadow-black/30 ring-1 ring-white/20 transition-[flex-grow] duration-500 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--hero-highlight)] lg:h-auto lg:flex-1 lg:hover:flex-[1.5] lg:focus-visible:flex-[1.5]"
            >
              <img
                src={CHOOSER_PHOTO[audience].src}
                alt={CHOOSER_PHOTO[audience].alt}
                className={`absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${focus}`}
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[#060d24] via-[#060d24]/55 to-[#060d24]/5"
              />
              <span className="absolute right-5 top-5 grid size-11 place-items-center rounded-full bg-white/90 text-[#060d24] shadow-lg transition-transform duration-300 group-hover:rotate-45">
                <ArrowUpRight className="size-5" aria-hidden />
              </span>
              <div className="relative p-6 md:p-7">
                <span className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hero-highlight)]">
                  {String(i + 1).padStart(2, '0')} · {label}
                </span>
                <span className="mt-2 block text-2xl font-semibold text-white [font-family:var(--font-display)] md:text-3xl">
                  {title}
                </span>
                <span className="mt-2 block max-w-sm text-sm leading-relaxed text-white/85">
                  {text}
                </span>
                <span className="grid transition-[grid-template-rows,opacity] duration-500 lg:grid-rows-[0fr] lg:opacity-0 lg:group-hover:grid-rows-[1fr] lg:group-hover:opacity-100 lg:group-focus-visible:grid-rows-[1fr] lg:group-focus-visible:opacity-100">
                  <span className="overflow-hidden">
                    <span className="mt-4 flex flex-wrap gap-2">
                      {points.map((point) => (
                        <span
                          key={point}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-xs text-white backdrop-blur"
                        >
                          <Check className="size-3.5" aria-hidden />
                          {point}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                  Continue
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 text-sm text-white/85 sm:flex-row">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {['30 days free', '$49 a month after', 'Cancel any time'].map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <Check className="size-4 text-[var(--hero-highlight)]" aria-hidden />
                {fact}
              </li>
            ))}
          </ul>
          <Link
            to="/try"
            className="group inline-flex items-center gap-1.5 font-semibold text-white"
          >
            Just looking? Try one free search
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
      </section>
    </div>
  )
}
