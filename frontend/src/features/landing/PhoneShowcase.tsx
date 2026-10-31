import { motion } from 'motion/react'

import phoneOverview from '../../assets/phone-overview.webp'
import phoneReport from '../../assets/phone-report.webp'
import phoneSafety from '../../assets/phone-safety.webp'
import { reveal, SectionHeading } from './landingParts'

const SCREENS = [
  {
    src: phoneOverview,
    title: 'Your status at a glance',
    text: 'Authority, registration and insurance, each with its FMCSA source.',
    alt: 'The carrier page on a phone: authority, registration and insurance status',
  },
  {
    src: phoneSafety,
    title: 'Your safety record',
    text: 'Safety rating, inspections, crashes and out-of-service rates.',
    alt: 'The Safety tab on a phone: safety rating, inspections, crashes and out-of-service rates',
  },
  {
    src: phoneReport,
    title: 'Your Safety Score Report',
    text: 'Your Estimated ISS and what’s behind it, ready to download as a PDF.',
    alt: 'The Safety Score Report on a phone: the Estimated ISS gauge',
  },
]

/** Real screens of the app, for a made-up carrier, each in a phone frame. */
export function PhoneShowcase() {
  return (
    <section className="pb-20">
      <SectionHeading eyebrow="On your phone" title="Check your carrier from anywhere" />
      <motion.p
        {...reveal()}
        className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-600 md:text-base"
      >
        CarrierSafetyScan works in your phone’s browser, with nothing to install.
      </motion.p>
      <div className="mx-auto mt-10 grid max-w-5xl gap-10 sm:grid-cols-3 sm:gap-6">
        {SCREENS.map(({ src, title, text, alt }, i) => (
          <motion.figure key={title} {...reveal(i * 0.05)} className="text-center">
            <div className="relative mx-auto w-full max-w-[260px] rounded-[2.25rem] bg-slate-900 p-2 shadow-2xl ring-1 ring-black/20">
              <span
                aria-hidden
                className="absolute left-1/2 top-3.5 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-slate-700"
              />
              <img
                src={src}
                alt={alt}
                loading="lazy"
                width={780}
                height={1560}
                className="h-auto w-full rounded-[1.75rem] bg-white pt-6"
              />
              <span className="absolute right-4 top-9 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
                Sample
              </span>
            </div>
            <figcaption className="mt-5">
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="mx-auto mt-1 block max-w-[260px] text-sm text-slate-600">
                {text}
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
      <motion.p {...reveal()} className="mt-6 text-center text-xs text-slate-500">
        Sample screens with example data for a made-up carrier.
      </motion.p>
    </section>
  )
}
