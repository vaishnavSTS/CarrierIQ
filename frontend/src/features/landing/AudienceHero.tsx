import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { homeFor, useMe } from '../../hooks/useAuth'
import { AUDIENCE_PATH, AUDIENCES, type Audience } from '../audience/audience'
import { PrimaryLink } from './landingParts'
import { HeroTryForm } from './LandingSections'
import { SampleShowcase } from './SampleShowcase'

const highlight = (text: string) => <span className="text-[var(--hero-highlight)]">{text}</span>

const HERO: Record<Audience, { tab: string; title: ReactNode; text: string }> = {
  carrier: {
    tab: 'For carriers',
    title: <>See your carrier {highlight('the way brokers do')}, and know exactly what to fix</>,
    text: 'Carrier Safety Scan gives you a clear picture of a carrier’s authority, insurance, safety and registration health, and explains what to do about it.',
  },
  broker: {
    tab: 'For brokers',
    title: (
      <>Vet any carrier {highlight('before you book the load')}, and spot the red flags early</>
    ),
    text: 'Check a carrier’s authority, insurance and safety record in one place, see the carriers it shares a phone, email or address with, and compare up to 3 side by side.',
  },
  agent: {
    tab: 'For insurance agents',
    title: <>Understand a trucking risk {highlight('before you quote it')}</>,
    text: 'Look up any carrier’s insurance filings, authority, safety record, crashes and fleet, and save a dated Safety Score Report for your file.',
  },
}

/**
 * The top of an audience's page: its headline, the free search and a sample of what it gets. The
 * pills switch to another audience's page.
 */
export function AudienceHero({ audience }: { audience: Audience }) {
  const { data: user } = useMe()
  const page = HERO[audience]
  return (
    <div className="relative">
      <nav
        aria-label="Who Carrier Safety Scan is for"
        className="relative z-20 mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-4 pt-8 lg:justify-start"
      >
        {AUDIENCES.map((a) => (
          <Link
            key={a}
            to={AUDIENCE_PATH[a]}
            aria-current={a === audience ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-medium ring-1 ring-white/50 transition-colors ${
              a === audience
                ? 'bg-[var(--hero-highlight)] text-[#0b1440] ring-[var(--hero-highlight)]'
                : 'text-white hover:bg-white/15'
            }`}
          >
            {HERO[a].tab}
          </Link>
        ))}
      </nav>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-64 pt-8 md:pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-[3.4rem]">
            {page.title}
          </h1>
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
        </div>

        <div className="mx-auto mt-14 w-full max-w-md lg:mt-8 lg:max-w-none">
          <SampleShowcase audience={audience} active />
        </div>
      </section>
    </div>
  )
}
