import type { ReactNode } from 'react'

import { homeFor, useMe } from '../../hooks/useAuth'
import type { Audience } from '../audience/audience'
import { PrimaryLink } from './landingParts'
import { HeroTryForm } from './LandingSections'
import { HERO_PHOTO } from './photos'
import { SampleShowcase } from './SampleShowcase'

const highlight = (text: string) => (
  <span className="font-accent text-[var(--hero-highlight)]">{text}</span>
)

const HERO: Record<Audience, { title: ReactNode; text: string }> = {
  carrier: {
    title: <>See your carrier {highlight('the way brokers do')}, and know exactly what to fix</>,
    text: 'Carrier Safety Scan gives you a clear picture of a carrier’s authority, insurance, safety and registration health, and explains what to do about it.',
  },
  broker: {
    title: (
      <>Vet any carrier {highlight('before you book the load')}, and spot the red flags early</>
    ),
    text: 'Check a carrier’s authority, insurance and safety record in one place, see the carriers it shares a phone, email or address with, and compare up to 3 side by side.',
  },
  agent: {
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
      {/* A real photo for each audience, faint under the blue and fading out before the page
        turns light. Carrier: Bhargav Panchal, Unsplash (unsplash.com/photos/P0bVatS8Jdw),
        Unsplash License; the others: photos.ts. */}
      <div aria-hidden className="hero-photo pointer-events-none absolute inset-x-0 top-0 h-[78%]">
        <img
          key={audience}
          src={HERO_PHOTO[audience]}
          alt=""
          className="size-full select-none object-cover object-[50%_60%]"
        />
        <div className="hero-photo-tint absolute inset-0" />
        <div className="hero-photo-scrim absolute inset-0" />
      </div>
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-64 pt-12 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
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
