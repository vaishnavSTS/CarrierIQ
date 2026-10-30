import {
  BadgeCheck,
  Check,
  Clock,
  FileSearch,
  Globe,
  Mail,
  MapPin,
  Phone,
  Scale,
  Send,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import reportPage1 from '../../assets/report-sample-1.webp'
import reportPage2 from '../../assets/report-sample-2.webp'
import { formatPhone } from '../../utils/format'
import { STS_CONTACT } from '../carrier-profile/packet/contact'
import stsLogo from '../carrier-profile/packet/sts-logo.png'
import { IconBadge, PrimaryLink, reveal, SectionHeading } from './landingParts'

/** Keep in step with MONTHLY_PRICE and TRIAL (backend/app/services/subscription.py). */
const MONTHLY_PRICE = 49
const TRIAL_DAYS = 30
/** Keep in step with the DataQs filing fee (backend DATAQS fee). */
const DATAQS_FEE = 50

/** From skytransportsolutions.com. Only what its pages agree on: no client counts or rankings. */
const STS_FOUNDED = 2013
const STS_FOUNDER = 'Aakash Nayyar'
const STS_ADDRESS = '121 E 11th St, Tracy, CA 95376'
const STS_HOURS = 'Monday–Friday, 9:00 AM – 5:30 PM Pacific'
const STS_SERVICES = [
  'DOT and MC authority',
  'BOC-3 and MCS-150 filings',
  'IRP and IFTA',
  'UCR and Form 2290',
  'Driver qualification files',
  'DOT safety audit preparation',
  'State permits',
  'CARB and Clean Truck Check',
]

/** The hero's search: goes on to Try Now, where the security check and the search itself run. */
export function HeroTryForm() {
  const [usdot, setUsdot] = useState('')
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = usdot.trim()
    navigate(/^\d{1,8}$/.test(value) ? `/try?usdot=${value}` : '/try')
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md lg:mx-0">
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-surface/90 p-2 shadow-lg backdrop-blur sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">USDOT number</span>
          <input
            inputMode="numeric"
            placeholder="Enter a USDOT number"
            value={usdot}
            onChange={(e) => setUsdot(e.target.value)}
            className="w-full rounded-xl bg-transparent px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-cta px-5 py-3 text-sm font-medium text-cta-ink transition-colors hover:bg-cta-hover active:bg-cta-active"
        >
          Try Now
        </button>
      </div>
      <p className="mt-2.5 text-center text-xs text-slate-600 lg:text-left">
        One free search, no account needed.
      </p>
    </form>
  )
}

const DATAQS_STEPS = [
  {
    icon: FileSearch,
    title: 'Find it',
    text: 'See every inspection and violation on your record, with the ones weighing most on your score first.',
  },
  {
    icon: Send,
    title: 'We file it',
    text: 'Choose the inspection and an STS specialist prepares and files the DataQs challenge with you.',
  },
  {
    icon: Scale,
    title: 'Follow it',
    text: 'Track your case in your portal. The agency reviewing the record makes the final decision.',
  },
]

/** The service that sets CarrierSafetyScan apart: STS files the challenge. */
export function DataQsSection() {
  return (
    <section className="pb-20">
      <SectionHeading
        eyebrow="DataQs challenges"
        title="Found a wrong violation? Our specialists challenge it for you."
      />
      <motion.p
        {...reveal()}
        className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-600 md:text-base"
      >
        A violation cited by mistake counts against your safety record until it’s corrected. If a
        challenge is accepted, the violation is removed and stops counting.
      </motion.p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {DATAQS_STEPS.map(({ icon, title, text }, i) => (
          <motion.article
            key={title}
            {...reveal(i * 0.05)}
            className="rounded-2xl border border-slate-200 bg-surface/90 p-6"
          >
            <IconBadge icon={icon} />
            <h3 className="mt-5 text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
          </motion.article>
        ))}
      </div>
      <motion.p {...reveal()} className="mt-5 text-center text-xs text-slate-500">
        ${DATAQS_FEE} per inspection. No outcome can be guaranteed: only a wrong record can be
        corrected.
      </motion.p>
    </section>
  )
}

/** Two real pages of the report, for a made-up carrier (no identifying details). */
export function ReportPreview() {
  return (
    <section className="pb-20">
      <SectionHeading eyebrow="See what you get" title="The Safety Score Report" />
      <motion.p
        {...reveal()}
        className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-600 md:text-base"
      >
        A clear, printable report on your carrier: your Estimated ISS, each safety category, what’s
        hurting your score, and plain-English steps to improve it.
      </motion.p>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
        {[
          { src: reportPage1, alt: 'Sample report page 1: the carrier safety scorecard' },
          { src: reportPage2, alt: 'Sample report page 2: what to fix and how to improve' },
        ].map(({ src, alt }, i) => (
          <motion.figure key={src} {...reveal(i * 0.05)} className="relative">
            <img
              src={src}
              alt={alt}
              loading="lazy"
              width={794}
              height={1123}
              className="h-auto w-full rounded-xl border border-slate-200 bg-white shadow-xl"
            />
            <span className="absolute right-3 top-3 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
              Sample
            </span>
          </motion.figure>
        ))}
      </div>
      <motion.p {...reveal()} className="mt-4 text-center text-xs text-slate-500">
        Sample report with example data for a made-up carrier. The Estimated ISS is
        CarrierSafetyScan’s estimate, not FMCSA’s official score or a safety rating.
      </motion.p>
    </section>
  )
}

const INCLUDED = [
  'Authority, insurance and safety for your carrier',
  'What’s hurting your score and how to improve it',
  'The downloadable Safety Score Report',
  'Cancel anytime',
]

export function PricingSection() {
  return (
    <section className="pb-20">
      <SectionHeading eyebrow="Pricing" title="Simple, clear pricing" />
      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-[1.2fr_1fr]">
        <motion.article
          {...reveal()}
          className="rounded-2xl border border-brand-glow/40 bg-surface p-7 shadow-lg shadow-brand-glow/10"
        >
          <p className="text-sm font-semibold text-accent-strong">{TRIAL_DAYS} days free, then</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-slate-950">
              ${MONTHLY_PRICE}
            </span>
            <span className="text-sm text-slate-600">/month per login</span>
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <PrimaryLink to="/register">Start your free trial</PrimaryLink>
          </div>
        </motion.article>
        <motion.article
          {...reveal(0.05)}
          className="flex flex-col rounded-2xl border border-slate-200 bg-surface/90 p-7"
        >
          <p className="text-sm font-semibold text-slate-700">DataQs challenges</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-slate-950">${DATAQS_FEE}</span>
            <span className="text-sm text-slate-600">per inspection</span>
          </p>
          <p className="mt-6 flex-1 text-sm leading-relaxed text-slate-600">
            Filed for you by Sky Transport Solutions. Filing 2 or more? Ask a specialist about our
            offers at {formatPhone(STS_CONTACT.phone)}.
          </p>
        </motion.article>
      </div>
    </section>
  )
}

/** Who stands behind the app. */
export function AboutStsSection() {
  const contacts = [
    {
      icon: Phone,
      label: formatPhone(STS_CONTACT.phone),
      href: `tel:+1${STS_CONTACT.phone}`,
    },
    { icon: Mail, label: STS_CONTACT.email, href: `mailto:${STS_CONTACT.email}` },
    { icon: Globe, label: STS_CONTACT.websiteLabel, href: STS_CONTACT.website },
  ]
  return (
    <section className="pb-20">
      <SectionHeading eyebrow="Who’s behind this" title="Built by Sky Transport Solutions" />
      <motion.div
        {...reveal()}
        className="mt-10 grid gap-8 rounded-3xl border border-slate-200 bg-surface/90 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]"
      >
        <div>
          <img src={stsLogo} alt="Sky Transport Solutions" className="h-16 w-auto object-contain" />
          <p className="mt-5 text-sm leading-relaxed text-slate-700 md:text-base">
            CarrierSafetyScan is built by Sky Transport Solutions, a trucking compliance company
            founded in {STS_FOUNDED} by {STS_FOUNDER}. STS helps trucking companies across the
            United States with registration, permits and DOT compliance, and it’s the team that
            handles your DataQs challenges.
          </p>
          <ul className="mt-6 grid gap-x-5 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
            {STS_SERVICES.map((service) => (
              <li key={service} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
                {service}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-700">
          <h3 className="font-semibold text-slate-900">Talk to a specialist</h3>
          <ul className="mt-4 space-y-3">
            {contacts.map(({ icon: Icon, label, href }) => (
              <li key={label}>
                <a
                  href={href}
                  className="flex items-center gap-2.5 break-all font-medium text-accent-strong hover:underline"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              {STS_ADDRESS}
            </li>
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              {STS_HOURS}
            </li>
          </ul>
          <p className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Sky Transport Solutions is a private company, not affiliated with FMCSA or any
            government agency.
          </p>
        </div>
      </motion.div>
    </section>
  )
}
