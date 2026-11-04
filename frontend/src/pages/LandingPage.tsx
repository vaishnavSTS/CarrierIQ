import { FileText, Search, UserPlus, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Audience } from '../features/audience/audience'
import { AudienceHero } from '../features/landing/AudienceHero'
import { PrimaryLink, reveal, SectionHeading } from '../features/landing/landingParts'
import { AboutStsSection, DataQsSection, ReportPreview } from '../features/landing/LandingSections'
import { PhoneShowcase } from '../features/landing/PhoneShowcase'
import { BrokerCheckArt, FixArt, PacketArt, RegistrationArt } from '../features/landing/RoleArt'
import { useMe } from '../hooks/useAuth'

type Feature = { art: () => ReactElement; title: string; text: string }
type Step = { icon: LucideIcon; title: string; text: string }

/** What each audience's page says: only what the app does for them. */
const CONTENT: Record<
  Audience,
  {
    featuresTitle: string
    features: Feature[]
    phoneTitle: string
    steps: Step[]
    stepsTitle: string
    cta: { title: string; text: string; signUp: string; signUpTo: string; logInTo: string }
  }
> = {
  carrier: {
    featuresTitle: 'Everything a broker checks, explained',
    features: [
      {
        art: BrokerCheckArt,
        title: 'See what a broker’s check sees',
        text: 'Authority, insurance, BOC-3, safety and inspection history from FMCSA, in one place, with the source named on every value.',
      },
      {
        art: FixArt,
        title: 'Know what to fix',
        text: 'Which violation groups weigh most in each CSA BASIC, the 49 CFR rule behind them, and how DataQs corrections work.',
      },
      {
        art: RegistrationArt,
        title: 'Catch registration problems early',
        text: 'Motus and legacy L&I gaps, stale MCS-150 updates, shared addresses or phones that can trip a broker’s fraud screen.',
      },
      {
        art: PacketArt,
        title: 'A packet you can send',
        text: 'A dated, sourced Safety Score Report to share with brokers and shippers. Facts from FMCSA, and estimates that follow FMCSA’s own published methods.',
      },
    ],
    phoneTitle: 'Check your carrier from anywhere',
    stepsTitle: 'From sign-up to a report in minutes',
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your USDOT',
        text: 'Your company, mobile number and USDOT number, or continue with Google. Your portal opens right away.',
      },
      {
        icon: Search,
        title: 'See what brokers see',
        text: 'Authority, insurance, safety and registration checks from FMCSA’s own records, each with its source.',
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
    featuresTitle: 'Vet a carrier in one place',
    features: [
      {
        art: BrokerCheckArt,
        title: 'Authority, insurance and safety together',
        text: 'Operating authority, insurance filings, BOC-3, safety record and the Estimated ISS from FMCSA’s records, each with its source.',
      },
      {
        art: RegistrationArt,
        title: 'Spot the red flags early',
        text: 'Registration gaps between Motus and legacy L&I, stale MCS-150 updates, out-of-service orders and past revocations.',
      },
      {
        art: FixArt,
        title: 'See who it’s linked to',
        text: 'Other carriers sharing its phone, email or address, and the Chameleon check for signs of a carrier re-registered under a new USDOT number.',
      },
      {
        art: PacketArt,
        title: 'A dated report for your file',
        text: 'Save a sourced Safety Score Report on the carrier you booked, and compare up to 3 carriers side by side.',
      },
    ],
    phoneTitle: 'Check any carrier from anywhere',
    stepsTitle: 'From sign-up to a vetted carrier in minutes',
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your MC number',
        text: 'We check your brokerage’s authority with FMCSA, and your portal opens right away.',
      },
      {
        icon: Search,
        title: 'Look up any carrier',
        text: 'By USDOT, MC number or name: authority, insurance, safety and registration checks with their sources.',
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
    featuresTitle: 'Everything you check before quoting',
    features: [
      {
        art: BrokerCheckArt,
        title: 'Insurance filings and authority',
        text: 'The liability and cargo filings FMCSA has on file, what FMCSA requires, and when the policy usually renews.',
      },
      {
        art: FixArt,
        title: 'Safety record and Estimated ISS',
        text: 'CSA BASICs, inspections, out-of-service rates against the national average, and CarrierSafetyScan’s Estimated ISS.',
      },
      {
        art: RegistrationArt,
        title: 'Crashes, fleet and red flags',
        text: 'The FMCSA crash record, trucks seen on inspections with their VINs, and registration gaps that point to risk.',
      },
      {
        art: PacketArt,
        title: 'A dated report for the file',
        text: 'Save a sourced Safety Score Report on the carrier you quote, so your file shows what the record said and when.',
      },
    ],
    phoneTitle: 'Check any carrier from anywhere',
    stepsTitle: 'From sign-up to a quote-ready file in minutes',
    steps: [
      {
        icon: UserPlus,
        title: 'Sign up with your NPN',
        text: 'Your agency and National Producer Number. Your portal opens right away.',
      },
      {
        icon: Search,
        title: 'Look up the carrier',
        text: 'Insurance filings, authority, safety record, crashes and fleet, each with its FMCSA source.',
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

/** One audience's page (carriers, freight brokers or insurance agents): what CarrierSafetyScan does for them. */
export function LandingPage({ audience }: { audience: Audience }) {
  const { data: user } = useMe()
  const content = CONTENT[audience]

  return (
    <div className="relative overflow-hidden">
      <div className="hero-gradient">
        <AudienceHero audience={audience} />
      </div>
      <div className="landing-rest">
        <div className="mx-auto max-w-6xl px-4">
          <section className="py-20">
            <SectionHeading eyebrow="What you get" title={content.featuresTitle} />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {content.features.map(({ art: Art, title, text }, i) => (
                <motion.article
                  key={title}
                  {...reveal(i * 0.08)}
                  className="group rounded-2xl border border-slate-200 bg-surface/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-brand-glow/15"
                >
                  <div className="-mx-6 -mt-6 mb-1 h-32 overflow-hidden rounded-t-2xl">
                    <Art />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                </motion.article>
              ))}
            </div>
          </section>

          {audience === 'carrier' && <DataQsSection />}
          <PhoneShowcase title={content.phoneTitle} />
          <ReportPreview />

          <section className="pb-20">
            <SectionHeading eyebrow="How it works" title={content.stepsTitle} />
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {content.steps.map(({ icon: Icon, title, text }, i) => (
                <motion.li key={title} {...reveal(i * 0.1)}>
                  <div className="flex items-center gap-3">
                    <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-900">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Step {i + 1}
                    </span>
                    {/* Connector: starts after the label and runs across the gap (-mr-6 = the
                      grid's gap-6) to the next step's icon. */}
                    {i < content.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="-mr-6 ml-1 hidden h-0.5 flex-1 rounded-full bg-gradient-to-r from-slate-300 via-brand-glow/40 to-slate-300 md:block"
                      />
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
                </motion.li>
              ))}
            </ol>
          </section>

          {!user && (
            <motion.section
              {...reveal()}
              className="relative mb-20 overflow-hidden rounded-3xl border border-brand-glow/30 bg-gradient-to-br from-accent-soft via-surface to-brand-glow-alt/15 px-6 py-12 text-center md:px-12"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl"
              />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                {content.cta.title}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600 md:text-base">
                {content.cta.text}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <PrimaryLink to={content.cta.signUpTo}>{content.cta.signUp}</PrimaryLink>
                <Link
                  to={content.cta.logInTo}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
                >
                  Log in
                </Link>
              </div>
            </motion.section>
          )}

          <AboutStsSection />
        </div>
      </div>
    </div>
  )
}
