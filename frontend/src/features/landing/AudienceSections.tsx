import {
  CircleX,
  ClipboardCheck,
  FileWarning,
  Network,
  ScanSearch,
  ShieldX,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'

import { Accent, reveal, SectionHeading, useDarkBand } from './landingParts'

/*
 * The sections only one audience's page has. Everything here matches what the app does today:
 * the broker grades follow features/compare/vetting.ts (keep them in step).
 */

type Group = {
  icon: LucideIcon
  label: string
  rule: string
  tag: string
  items: string[]
}

/** The booking check's three caution levels, as vetting.ts applies them. */
const GRADES: Group[] = [
  {
    icon: CircleX,
    label: 'Do not book',
    rule: 'Any one of these',
    tag: 'bg-red-600 text-surface',
    items: [
      'Operating authority not active, or a revocation pending',
      'No liability insurance on file, or less than the legal minimum',
      'An active out-of-service order',
      'An Unsatisfactory safety rating',
    ],
  },
  {
    icon: TriangleAlert,
    label: 'High risk',
    rule: 'Any one of these, or 3 or more review items',
    tag: 'bg-red-100 text-red-800',
    items: [
      'A Conditional safety rating',
      'A fatal crash in the last 24 months',
      'Over the threshold in a crash-related safety category',
      'An Estimated ISS of 75 or higher',
      'Out-of-service rates twice the national average or more',
      'Authority under a year old with 10 or more power units',
    ],
  },
  {
    icon: FileWarning,
    label: 'Book with review',
    rule: 'One or two of these',
    tag: 'bg-amber-100 text-amber-900',
    items: [
      'Authority under 6 months old',
      'Authority revoked in the last 3 years, since reinstated',
      'Liability under $1,000,000',
      'An insurance renewal due within 30 days',
      'Fewer than 3 inspections in 24 months',
      'An Estimated ISS of 50 to 74, or over the threshold in another safety category',
      'Out-of-service rates above the national average',
    ],
  },
]

const FRAUD = [
  {
    icon: Network,
    title: 'Linked carriers',
    text: 'Other carriers sharing its phone, email or address, and any tie to a revoked USDOT number.',
  },
  {
    icon: ScanSearch,
    title: 'Chameleon check',
    text: 'Signs it re-registered under a new name and USDOT number to leave a record behind.',
  },
]

/** Broker page: what the booking check holds against a carrier, grade by grade. */
export function BrokerRedFlagsSection({ number }: { number?: string }) {
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="The booking check"
        title={
          <>
            The red flags it catches, <Accent>before the load moves</Accent>
          </>
        }
        aside="Every carrier you open gets a grade with its reasons: Ready to book when none of these apply. It reads the record the same way every time; the booking decision stays yours."
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {GRADES.map(({ icon: Icon, label, rule, tag, items }, i) => (
          <motion.article
            key={label}
            {...reveal(i * 0.08)}
            className="rounded-2xl bg-surface p-6 shadow-2xl shadow-black/20"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${tag}`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </span>
            </div>
            <p className="font-label mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {rule}
            </p>
            <ul className="mt-3 space-y-2.5">
              {items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {FRAUD.map(({ icon: Icon, title, text }, i) => (
          <motion.div
            key={title}
            {...reveal(0.1 + i * 0.08)}
            className="flex gap-4 rounded-2xl border border-white/15 bg-white/8 p-5 backdrop-blur"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-300 text-[#060d24]">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/80">{text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** Agent page: the questions behind a quote, and where each answer is in the portal. */
const UNDERWRITING = [
  {
    q: 'Is the authority active, and for how long?',
    a: 'Each docket’s status and age, any revocation pending, and past revocations and reinstatements.',
    tab: 'Authority & Insurance',
  },
  {
    q: 'Is the required coverage on file?',
    a: 'Liability (BI&PD) on file against the federal minimum, cargo and bond, each policy’s insurer and dates, and an expected renewal month.',
    tab: 'Authority & Insurance',
  },
  {
    q: 'What does the crash record show?',
    a: 'Crashes in the last 24 months, including any fatal ones, and the crash-related safety category.',
    tab: 'Inspections',
  },
  {
    q: 'How does it do at roadside?',
    a: 'Vehicle and driver out-of-service rates against the national average, the CSA safety categories and the Estimated ISS.',
    tab: 'Inspections',
  },
  {
    q: 'Does the fleet match what you’re quoting?',
    a: 'Power units on its registration next to the trucks and trailers seen on inspections, each VIN decoded into make, model and year.',
    tab: 'Equipment',
  },
  {
    q: 'Is it tied to other carriers?',
    a: 'Carriers sharing its phone, email or address, VINs seen under other USDOT numbers, and signs of a re-registered carrier.',
    tab: 'Linked carriers',
  },
]

export function AgentUnderwritingSection({ number }: { number?: string }) {
  const dark = useDarkBand()
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="Before you quote"
        title={
          <>
            Six questions, <Accent>answered on one page</Accent>
          </>
        }
        aside="What underwriting asks about a trucking risk, and the tab of the carrier’s page that answers it."
      />
      <ol className="mt-12 grid gap-4 md:grid-cols-2">
        {UNDERWRITING.map(({ q, a, tab }, i) => (
          <motion.li
            key={q}
            {...reveal((i % 2) * 0.08)}
            className="flex gap-4 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm"
          >
            <span className="font-label grid size-9 shrink-0 place-items-center rounded-full bg-[#101853] text-xs font-semibold text-white">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{a}</p>
              <p className="font-label mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                <ClipboardCheck className="size-3.5" aria-hidden />
                {tab} tab
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
      <motion.p
        {...reveal()}
        className={`mt-6 text-center text-xs ${dark ? 'text-white/80' : 'text-slate-500'}`}
      >
        It shows what the record says and flags what usually needs a closer look. The underwriting
        decision stays with you.
      </motion.p>
    </div>
  )
}

/** Carrier page: what a broker's check can hold against you, and how each is fixed. */
const FIXES = [
  {
    flag: 'Authority not active, or a revocation pending',
    fix: 'Reinstate it before brokers stop booking you. Sky Transport Solutions handles DOT and MC authority.',
  },
  {
    flag: 'No liability insurance on file, or below the minimum',
    fix: 'Have your insurer file your coverage with FMCSA. Your page shows what’s on file against what’s required.',
  },
  {
    flag: 'MCS-150 update past due',
    fix: 'Every carrier updates it every two years, even if nothing changed. Your page shows the due month, and STS can file it.',
  },
  {
    flag: 'No BOC-3 process agent on file',
    fix: 'Needed for operating authority. Sky Transport Solutions files BOC-3s.',
  },
  {
    flag: 'A violation that shouldn’t be on your record',
    fix: 'If it was cited by mistake, STS prepares and files a DataQs challenge with you.',
  },
  {
    flag: 'A phone, email or address shared with other carriers',
    fix: 'Brokers’ fraud screens flag these. See exactly which carriers share them, and why it may be flagged.',
  },
]

export function CarrierFixSection({ number }: { number?: string }) {
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="Before a broker sees it"
        title={
          <>
            What holds a booking back, <Accent>and how to fix it</Accent>
          </>
        }
        aside="The items a broker’s check commonly reacts to. Your carrier page shows which apply to you, and what to do about each."
      />
      <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FIXES.map(({ flag, fix }, i) => (
          <motion.li
            key={flag}
            {...reveal((i % 3) * 0.06)}
            className="flex flex-col rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm"
          >
            <p className="flex gap-2.5 text-sm font-semibold text-slate-900">
              <ShieldX className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
              {flag}
            </p>
            <p className="mt-3 flex gap-2.5 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
              <Wrench className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {fix}
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
