import { BadgeCheck, FileCheck2, ShieldAlert, Truck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { homeFor, useMe } from '../../hooks/useAuth'
import type { Audience } from '../audience/audience'
import { AgentHeroCollage, MinimumStrip } from './AgentHeroCollage'
import { CarrierHeroBoard } from './CarrierHeroBoard'
import { PrimaryLink } from './landingParts'
import { HeroTryForm } from './LandingSections'
import { HERO_PHOTO } from './photos'
import { HeroTool } from './HeroTools'

const highlight = (text: string) => (
  <span className="font-accent text-[var(--hero-highlight)]">{text}</span>
)

/**
 * Each audience's hero has its own layout (the colours stay the same):
 * - carrier: headline and search on top, then a dashboard of a sample carrier's own record with
 *   the MCS-150 tool inside it (CarrierHeroBoard);
 * - broker: centred, the search in the middle and the booking check under it (a vetting desk);
 * - agent: text left with a liability-minimum strip, and a photo of an agent with a client with
 *   facts floating over it, turning through sample carriers (AgentHeroCollage).
 */
const HERO: Record<
  Audience,
  { eyebrow: string; icon: LucideIcon; title: ReactNode; text: string; facts: string[] }
> = {
  carrier: {
    eyebrow: 'For carriers · your own record',
    icon: Truck,
    title: <>See your carrier {highlight('the way brokers do')}, and know exactly what to fix</>,
    text: 'Carrier Safety Scan gives you a clear picture of your authority, insurance, safety and registration health, and explains what to do about each item.',
    facts: ['What brokers see', 'What to fix first', 'DataQs filed for you'],
  },
  broker: {
    eyebrow: 'For freight brokers · the vetting desk',
    icon: ShieldAlert,
    title: (
      <>Vet any carrier {highlight('before you book the load')}, and spot the red flags early</>
    ),
    text: 'Check a carrier’s authority, insurance and safety record in one place, see the carriers it shares a phone, email or address with, and compare up to 3 side by side.',
    facts: ['Booking check', 'Chameleon check', 'Compare up to 3'],
  },
  agent: {
    eyebrow: 'For insurance agents · underwriting',
    icon: FileCheck2,
    title: <>Understand a trucking risk {highlight('before you quote it')}</>,
    text: 'Look up any carrier’s insurance filings, authority, safety record, crashes and fleet, and save a dated Safety Score Report for your file.',
    facts: ['Filings & renewal month', 'Crashes & roadside record', 'Fleet by VIN'],
  },
}

export function AudienceHero({ audience }: { audience: Audience }) {
  const { data: user } = useMe()
  const page = HERO[audience]
  const centered = audience === 'broker'
  const Icon = page.icon

  const eyebrow = (
    <p
      className={`font-label inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white ring-1 ring-white/25 backdrop-blur`}
    >
      <Icon className="size-3.5 text-[var(--hero-highlight)]" aria-hidden />
      {page.eyebrow}
    </p>
  )

  const action = user ? (
    <div className={`flex ${centered ? 'justify-center' : 'justify-center lg:justify-start'}`}>
      <PrimaryLink to={homeFor(user.portal)}>
        Open {user.portal === 'internal' ? 'the dashboard' : 'my portal'}
      </PrimaryLink>
    </div>
  ) : (
    <HeroTryForm centered={centered} />
  )

  const facts = (
    <ul
      className={`mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/90 ${centered ? 'justify-center' : 'justify-center lg:justify-start'}`}
    >
      {page.facts.map((fact) => (
        <li key={fact} className="flex items-center gap-1.5">
          <BadgeCheck className="size-4 text-[var(--hero-highlight)]" aria-hidden />
          {fact}
        </li>
      ))}
    </ul>
  )

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

      {audience === 'carrier' ? (
        // Carrier: the headline across the top with the search beside it, then a wide dashboard
        // of a sample carrier's own record, with the MCS-150 tool as one of its cards.
        // Centred in the screen below the header (6.25rem), so it sits mid-screen at any height.
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-40 pt-8 md:pt-10 lg:flex lg:min-h-[calc(100svh-6.25rem+6rem)] lg:flex-col lg:justify-center lg:pb-[7.5rem] lg:pt-6">
          <div className="grid items-end gap-x-12 gap-y-6 text-center lg:grid-cols-[1.2fr_1fr] lg:text-left">
            <div>
              {eyebrow}
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-5xl lg:text-[3rem]">
                {page.title}
              </h1>
            </div>
            <div>
              <p className="mx-auto max-w-xl text-base text-white/90 lg:mx-0">{page.text}</p>
              <div className="mt-4">{action}</div>
              <div className="[&>ul]:mt-3">{facts}</div>
            </div>
          </div>
          <div className="mt-7">
            <CarrierHeroBoard />
          </div>
        </section>
      ) : centered ? (
        // Broker: one column, everything centred, the booking check under the search.
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-56 pt-12 text-center md:pt-16 lg:pt-20">
          {eyebrow}
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.06] tracking-tight text-white md:text-5xl lg:text-[3.6rem]">
            {page.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/90 md:text-lg">{page.text}</p>
          <div className="mt-8">{action}</div>
          {facts}
          <div className="mx-auto mt-12 w-full max-w-2xl text-left">
            <HeroTool audience={audience} />
          </div>
        </section>
      ) : (
        // Agent: text left with the liability-minimum strip; a photo with floating facts right.
        <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-56 pt-10 md:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20 lg:pt-14">
          <div className="text-center lg:text-left">
            {eyebrow}
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-[3.2rem]">
              {page.title}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/90 md:text-lg lg:mx-0">
              {page.text}
            </p>
            <div className="mt-6">{action}</div>
            {facts}
            <MinimumStrip />
          </div>
          <div className="mx-auto w-full max-w-md px-6 lg:max-w-none lg:px-8">
            <AgentHeroCollage />
          </div>
        </section>
      )}
    </div>
  )
}
