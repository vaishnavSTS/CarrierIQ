import { ArrowRight, Check } from 'lucide-react'
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
}[] = [
  {
    audience: 'carrier',
    label: 'Carriers',
    title: 'I’m a carrier',
    text: 'See your company the way brokers do, and know what to fix.',
    points: ['What a broker’s check would flag', 'Your Estimated ISS', 'DataQs challenges'],
  },
  {
    audience: 'broker',
    label: 'Freight brokers',
    title: 'I’m a freight broker',
    text: 'Vet any carrier before you book the load.',
    points: ['A booking check on every carrier', 'Chameleon check', 'Compare up to 3'],
  },
  {
    audience: 'agent',
    label: 'Insurance agents',
    title: 'I’m an insurance agent',
    text: 'Understand a trucking risk before you quote it.',
    points: ['Filings and authority', 'Safety record and crashes', 'Fleet by VIN'],
  },
]

/**
 * The front door: the visitor says whether they're a carrier, a freight broker or an insurance
 * agent, and lands on that page. Asked on every visit (nothing is stored); someone logged in goes
 * to their portal.
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
        <h1 className="text-center text-4xl font-semibold text-white md:text-5xl lg:text-6xl">
          Welcome to Carrier Safety Scan
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-white/90 md:text-lg">
          Tell us who you are and we’ll show you what matters to you.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {/* Shown at once (no fade-in): choosing is the whole page. */}
          {CHOICES.map(({ audience, label, title, text, points }, i) => (
            <button
              key={audience}
              type="button"
              onClick={() => choose(audience)}
              className="group flex flex-col overflow-hidden rounded-3xl bg-surface text-left shadow-2xl shadow-black/20 ring-1 ring-white/30 transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--hero-highlight)]"
            >
              <div className="relative h-44 overflow-hidden bg-slate-200">
                <img
                  src={CHOOSER_PHOTO[audience].src}
                  alt={CHOOSER_PHOTO[audience].alt}
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-[#060d24]/50 via-transparent to-transparent"
                />
                <span className="font-label absolute bottom-3 left-4 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#060d24] shadow">
                  {String(i + 1).padStart(2, '0')} · {label}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <span className="text-xl font-semibold text-slate-900">{title}</span>
                <span className="mt-2 text-sm leading-relaxed text-slate-600">{text}</span>
                <span className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
                  {points.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                    >
                      <Check className="size-3 text-emerald-600" aria-hidden />
                      {point}
                    </span>
                  ))}
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong">
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

        <div className="mt-8 flex flex-col items-center justify-center gap-x-8 gap-y-3 text-sm text-white/90 sm:flex-row">
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
