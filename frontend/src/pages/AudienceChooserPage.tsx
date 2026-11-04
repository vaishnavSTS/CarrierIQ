import { ArrowRight } from 'lucide-react'
import { useEffect, type ReactElement } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { AUDIENCE_PATH, forgetStoredAudience, type Audience } from '../features/audience/audience'
import { AgentArt, BrokerArt, CarrierArt } from '../features/landing/RoleArt'
import { homeFor, useMe } from '../hooks/useAuth'

const CHOICES: { audience: Audience; art: () => ReactElement; title: string; text: string }[] = [
  {
    audience: 'carrier',
    art: CarrierArt,
    title: 'I’m a carrier',
    text: 'See your company the way brokers do, and know what to fix.',
  },
  {
    audience: 'broker',
    art: BrokerArt,
    title: 'I’m a freight broker',
    text: 'Vet any carrier before you book the load.',
  },
  {
    audience: 'agent',
    art: AgentArt,
    title: 'I’m an insurance agent',
    text: 'Understand a trucking risk before you quote it.',
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
        <h1 className="text-center text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
          Welcome to CarrierSafetyScan
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-white/90 md:text-lg">
          FMCSA’s public carrier records, made clear. Tell us who you are and we’ll show you what
          matters to you.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {/* Shown at once (no fade-in): choosing is the whole page. */}
          {CHOICES.map(({ audience, art: Art, title, text }) => (
            <button
              key={audience}
              type="button"
              onClick={() => choose(audience)}
              className="group flex flex-col overflow-hidden rounded-3xl bg-surface text-left shadow-2xl shadow-black/20 ring-1 ring-white/30 transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--hero-highlight)]"
            >
              <div className="h-40 overflow-hidden">
                <Art />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <span className="text-xl font-semibold text-slate-900">{title}</span>
                <span className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{text}</span>
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
      </section>
    </div>
  )
}
