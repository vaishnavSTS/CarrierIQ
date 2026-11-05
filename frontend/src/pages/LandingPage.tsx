import { ArrowRight, FileText, Search, UserPlus, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { Audience } from '../features/audience/audience'
import { AudienceHero } from '../features/landing/AudienceHero'
import {
  AgentUnderwritingSection,
  BrokerRedFlagsSection,
  CarrierFixSection,
} from '../features/landing/AudienceSections'
import {
  Accent,
  Band,
  reveal,
  SectionHeading,
  type BandTone,
} from '../features/landing/landingParts'
import { CompareShowcase } from '../features/landing/CompareShowcase'
import { FaqSection } from '../features/landing/Faq'
import { MapSection } from '../features/landing/MapSection'
import { AUDIENCE_FAQ } from '../features/landing/faqContent'
import { AboutStsSection, DataQsSection, ReportPreview } from '../features/landing/LandingSections'
import { PhoneShowcase } from '../features/landing/PhoneShowcase'
import { PortalFeatures } from '../features/landing/PortalFeatures'
import { BAND_PHOTO, FEATURE_PHOTOS, SECTION_PHOTO } from '../features/landing/photos'
import { ChecksMarquee } from '../features/landing/ChecksMarquee'
import { useMe } from '../hooks/useAuth'

type Feature = { title: string; text: string }
type Step = { icon: LucideIcon; title: string; text: string }

/** What each audience's page says: only what the app does for them. */
const CONTENT: Record<
  Audience,
  {
    featuresTitle: ReactNode
    featuresAside: string
    features: Feature[]
    phoneTitle: ReactNode
    steps: Step[]
    stepsTitle: ReactNode
    cta: { title: string; text: string; signUp: string; signUpTo: string; logInTo: string }
  }
> = {
  carrier: {
    featuresTitle: (
      <>
        Everything a broker checks, <Accent>explained</Accent>
      </>
    ),
    featuresAside:
      'Your carrier the way a broker’s check sees it, in plain English, with what to do about each item.',
    features: [
      {
        title: 'See what a broker’s check sees',
        text: 'Authority, insurance, BOC-3, safety and inspection history, all in one place.',
      },
      {
        title: 'Know what to fix',
        text: 'Which violation groups weigh most in each CSA BASIC, the 49 CFR rule behind them, and how DataQs corrections work.',
      },
      {
        title: 'Catch registration problems early',
        text: 'Registration gaps, stale MCS-150 updates, shared addresses or phones that can trip a broker’s fraud screen.',
      },
      {
        title: 'A packet you can send',
        text: 'A dated Safety Score Report to share with brokers and shippers, with estimates that follow FMCSA’s own published methods.',
      },
    ],
    phoneTitle: (
      <>
        Check your carrier <Accent>from anywhere</Accent>
      </>
    ),
    stepsTitle: (
      <>
        From sign-up to a report <Accent>in minutes</Accent>
      </>
    ),
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your USDOT',
        text: 'Your company, mobile number and USDOT number, or continue with Google. Your portal opens right away.',
      },
      {
        icon: Search,
        title: 'See what brokers see',
        text: 'Authority, insurance, safety and registration checks, the way a broker’s check runs them.',
      },
      {
        icon: FileText,
        title: 'Fix it and share it',
        text: 'Work through what weighs most in your CSA measures, then send brokers your Safety Score Report.',
      },
    ],
    cta: {
      title: 'See your carrier the way brokers do',
      text: 'Create your account with your USDOT number and your portal opens straight away.',
      signUp: 'Create a carrier account',
      signUpTo: '/register',
      logInTo: '/login',
    },
  },
  broker: {
    featuresTitle: (
      <>
        Vet a carrier <Accent>in one place</Accent>
      </>
    ),
    featuresAside:
      'Authority, insurance, safety and the red flags a fraud screen looks for, on one page, before you book.',
    features: [
      {
        title: 'Authority, insurance and safety together',
        text: 'Operating authority, insurance filings, BOC-3, safety record and the Estimated ISS, all in one place.',
      },
      {
        title: 'Spot the red flags early',
        text: 'Registration gaps, stale MCS-150 updates, out-of-service orders and past revocations.',
      },
      {
        title: 'See who it’s linked to',
        text: 'Other carriers sharing its phone, email or address, and the Chameleon check for signs of a carrier re-registered under a new USDOT number.',
      },
      {
        title: 'A dated report for your file',
        text: 'Save a dated Safety Score Report on the carrier you booked, and compare up to 3 carriers side by side.',
      },
    ],
    phoneTitle: (
      <>
        Check any carrier <Accent>from anywhere</Accent>
      </>
    ),
    stepsTitle: (
      <>
        From sign-up to a vetted carrier <Accent>in minutes</Accent>
      </>
    ),
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your MC number',
        text: 'We check your brokerage’s operating authority, and your portal opens right away.',
      },
      {
        icon: Search,
        title: 'Look up any carrier',
        text: 'By USDOT, MC number or name: authority, insurance, safety and registration checks.',
      },
      {
        icon: FileText,
        title: 'Book with the facts',
        text: 'Review the booking check and the linked carriers, and save a dated report for your file.',
      },
    ],
    cta: {
      title: 'Vet your next carrier before you book',
      text: 'Create your brokerage account with your MC number and start checking carriers straight away.',
      signUp: 'Create a broker account',
      signUpTo: '/broker/register',
      logInTo: '/broker/login',
    },
  },
  agent: {
    featuresTitle: (
      <>
        Everything you check <Accent>before quoting</Accent>
      </>
    ),
    featuresAside:
      'Filings, safety record, crashes and fleet together, so you quote with the full picture.',
    features: [
      {
        title: 'Insurance filings and authority',
        text: 'The liability and cargo filings on file, what FMCSA requires, and when the policy usually renews.',
      },
      {
        title: 'Safety record and Estimated ISS',
        text: 'CSA BASICs, inspections, out-of-service rates against the national average, and Carrier Safety Scan’s Estimated ISS.',
      },
      {
        title: 'Crashes, fleet and red flags',
        text: 'The crash record, trucks seen on inspections with their VINs, and registration gaps that point to risk.',
      },
      {
        title: 'A dated report for the file',
        text: 'Save a dated Safety Score Report on the carrier you quote, so your file shows what the record said and when.',
      },
    ],
    phoneTitle: (
      <>
        Check any carrier <Accent>from anywhere</Accent>
      </>
    ),
    stepsTitle: (
      <>
        From sign-up to a quote-ready file <Accent>in minutes</Accent>
      </>
    ),
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your NPN',
        text: 'Your agency and National Producer Number. Your portal opens right away.',
      },
      {
        icon: Search,
        title: 'Look up the carrier',
        text: 'Insurance filings, authority, safety record, crashes and fleet, all in one place.',
      },
      {
        icon: FileText,
        title: 'Save it for the file',
        text: 'Download a dated Safety Score Report to keep with the quote.',
      },
    ],
    cta: {
      title: 'Understand the risk before you quote it',
      text: 'Create your agent account with your National Producer Number and start checking carriers.',
      signUp: 'Create an agent account',
      signUpTo: '/insurance/register',
      logInTo: '/insurance/login',
    },
  },
}

/** The parts of an audience page, in the order and on the background that page uses. */
type Part =
  | 'features'
  | 'fix'
  | 'dataqs'
  | 'redFlags'
  | 'underwriting'
  | 'compare'
  | 'map'
  | 'portal'
  | 'phone'
  | 'report'
  | 'steps'
  | 'faq'
  | 'cta'
  | 'about'

/** Each page has its own order and backgrounds; no two neighbouring bands share one. DataQs is
 * on the carrier page only (it's a carrier service). */
const LAYOUT: Record<Audience, [Part, BandTone, photo?: string][]> = {
  carrier: [
    ['features', 'mesh'],
    ['fix', 'plain'],
    ['dataqs', 'photo', SECTION_PHOTO.carrierDataqs],
    ['map', 'grid'],
    ['portal', 'warm'],
    ['phone', 'grid'],
    ['report', 'tint'],
    ['steps', 'photo'],
    ['faq', 'dots'],
    ['cta', 'tint'],
    ['about', 'plain'],
  ],
  broker: [
    ['features', 'plain'],
    ['redFlags', 'photo', SECTION_PHOTO.brokerFlags],
    ['map', 'tint'],
    ['compare', 'warm'],
    ['portal', 'mesh'],
    ['steps', 'photo'],
    ['faq', 'dots'],
    ['cta', 'tint'],
    ['about', 'plain'],
  ],
  agent: [
    ['features', 'warm'],
    ['underwriting', 'photo', SECTION_PHOTO.agentQuestions],
    ['map', 'tint'],
    ['compare', 'mesh'],
    ['portal', 'plain'],
    ['steps', 'photo'],
    ['faq', 'dots'],
    ['cta', 'grid'],
    ['about', 'plain'],
  ],
}

/** Parts without a section number. */
const UNNUMBERED: Part[] = ['cta', 'about']

/** The carrier map section's words for each audience. */
const MAP_WORDS: Record<Audience, { title: ReactNode; aside: string }> = {
  carrier: {
    title: (
      <>
        Who’s hauling <Accent>in your state</Accent>
      </>
    ),
    aside:
      'How many carriers are active in each state and who just registered: the companies brokers weigh you against.',
  },
  broker: {
    title: (
      <>
        Find carriers <Accent>state by state</Accent>
      </>
    ),
    aside:
      'Where carriers are based, who registered this month and who runs the biggest fleets. Open any of them with your free search.',
  },
  agent: {
    title: (
      <>
        Trucking risk, <Accent>state by state</Accent>
      </>
    ),
    aside:
      'Where carriers are based, which are newly registered and which run large fleets: the accounts you may be asked to quote.',
  },
}

/** The report sample's words for each audience. */
const REPORT_ASIDE: Record<Audience, string> = {
  carrier:
    'A clear, printable report on your carrier: the Estimated ISS, each safety category, what’s hurting the score, and plain-English steps to improve it. Send it to brokers before they ask.',
  broker:
    'A dated, printable report on the carrier you booked: authority, insurance, safety and red flags as they stood that day, to keep with the load.',
  agent:
    'A dated, printable report on the carrier you quoted: filings, safety record, crashes and fleet as they stood that day, to keep in the underwriting file.',
}

/** One audience's page (carriers, freight brokers or insurance agents): what Carrier Safety Scan does for them. */
export function LandingPage({ audience }: { audience: Audience }) {
  const { data: user } = useMe()
  const content = CONTENT[audience]

  // Logged-in visitors don't get the sign-up band. Section numbers run on down the page.
  const parts = LAYOUT[audience].filter(([part]) => part !== 'cta' || !user)
  let count = 0
  const numbered = parts.map(([part, tone, photo]) => ({
    part,
    tone,
    // A photo band uses its own picture, or the audience's road photo ("How it works").
    photo: tone === 'photo' ? (photo ?? BAND_PHOTO[audience]) : undefined,
    number: UNNUMBERED.includes(part) ? undefined : String(++count).padStart(2, '0'),
  }))

  const render = (part: Part, number?: string) => {
    switch (part) {
      case 'features':
        return (
          <>
            <SectionHeading
              number={number}
              eyebrow="What you get"
              title={content.featuresTitle}
              aside={content.featuresAside}
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {content.features.map(({ title, text }, i) => (
                <motion.article
                  key={title}
                  {...reveal(i * 0.08)}
                  className="group rounded-2xl border border-slate-200 bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-brand-glow/15"
                >
                  <div className="relative -mx-6 -mt-6 mb-1 h-40 overflow-hidden rounded-t-2xl bg-slate-200">
                    <img
                      src={FEATURE_PHOTOS[audience][i].src}
                      alt={FEATURE_PHOTOS[audience][i].alt}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-[#060d24]/50 via-transparent to-transparent"
                    />
                    <span className="absolute bottom-3 left-4 grid size-7 place-items-center rounded-full font-label bg-white/90 text-xs font-semibold text-[#060d24] shadow">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                </motion.article>
              ))}
            </div>
          </>
        )
      case 'fix':
        return <CarrierFixSection number={number} />
      case 'dataqs':
        return <DataQsSection number={number} />
      case 'redFlags':
        return <BrokerRedFlagsSection number={number} />
      case 'underwriting':
        return <AgentUnderwritingSection number={number} />
      case 'compare':
        return <CompareShowcase who={audience === 'agent' ? 'agent' : 'broker'} number={number} />
      case 'map':
        return (
          <MapSection
            number={number}
            title={MAP_WORDS[audience].title}
            aside={MAP_WORDS[audience].aside}
            signUp={
              user ? undefined : { to: content.cta.signUpTo, label: 'Start free for 30 days' }
            }
          />
        )
      case 'portal':
        return <PortalFeatures audience={audience} number={number} />
      case 'phone':
        return <PhoneShowcase audience={audience} number={number} title={content.phoneTitle} />
      case 'report':
        return <ReportPreview number={number} aside={REPORT_ASIDE[audience]} />
      case 'steps':
        return (
          <>
            <SectionHeading number={number} eyebrow="How it works" title={content.stepsTitle} />
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {content.steps.map(({ icon: Icon, title, text }, i) => (
                <motion.li key={title} {...reveal(i * 0.1)}>
                  <div className="flex items-center gap-3">
                    <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-label shrink-0 text-xs font-medium uppercase tracking-wider text-white/70">
                      Step {i + 1}
                    </span>
                    {/* Connector: starts after the label and runs across the gap (-mr-8 = the
                      grid's gap-8) to the next step's icon. */}
                    {i < content.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="-mr-8 ml-1 hidden h-0.5 flex-1 rounded-full bg-gradient-to-r from-white/30 via-amber-300/60 to-white/30 md:block"
                      />
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/80">{text}</p>
                </motion.li>
              ))}
            </ol>
          </>
        )
      case 'faq':
        return <FaqSection number={number} items={AUDIENCE_FAQ[audience]} />
      case 'cta':
        return (
          <motion.div
            {...reveal()}
            className="band-dark relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-2xl shadow-brand-glow/20 md:px-12"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl"
            />
            <h2 className="relative text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {content.cta.title}
            </h2>
            <p className="relative mx-auto mt-3 max-w-lg text-sm text-white/80 md:text-base">
              {content.cta.text}
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to={content.cta.signUpTo}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-[#060d24] shadow-lg transition-colors hover:bg-amber-300"
              >
                {content.cta.signUp}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to={content.cta.logInTo}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/50 transition-colors hover:bg-white/10"
              >
                Log in
              </Link>
            </div>
          </motion.div>
        )
      case 'about':
        return <AboutStsSection dataQs={audience === 'carrier'} />
    }
  }

  return (
    <div className="relative overflow-hidden">
      {/* The hero and the scrolling strip fill the first screen (below the 101px header), so
          the strip shows at its bottom without scrolling. */}
      <div className="flex flex-col lg:min-h-[calc(100svh-101px)]">
        <div className="hero-gradient flex flex-1 flex-col">
          <AudienceHero audience={audience} />
        </div>
        <ChecksMarquee audience={audience} />
      </div>
      {numbered.map(({ part, tone, photo, number }) => (
        <Band key={part} tone={tone} photo={photo}>
          {render(part, number)}
        </Band>
      ))}
    </div>
  )
}
