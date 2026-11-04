import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardList,
  Columns3,
  CreditCard,
  Eye,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Network,
  Receipt,
  Scale,
  ScanSearch,
  Search,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

import { AUDIENCE_PATH, type Audience } from '../audience/audience'
import { Accent, reveal, SectionHeading } from './landingParts'

type Item = { icon: LucideIcon; title: string; text: string }

/**
 * Everything each portal includes, tab by tab (pages/CarrierProfilePage.tsx CLIENT_TABS /
 * BROKER_TABS, router.tsx). Keep in step with the app: only what a new account actually gets.
 */
const PLAN: Item = {
  icon: CreditCard,
  title: 'Free for 30 days',
  text: 'Then $49 a month. Cancel any time and keep access to the end of the month you paid for.',
}

const COMMON = {
  overview: {
    icon: Gauge,
    title: 'Overview and safety score',
    text: 'Company details and the Estimated ISS, 1–100, with the safety category that drives it.',
  },
  authority: {
    icon: ShieldCheck,
    title: 'Authority & Insurance',
    text: 'Is the MC active, is liability and cargo insurance on file, the BOC-3 filing and any revocations.',
  },
  inspections: {
    icon: ClipboardList,
    title: 'Inspections',
    text: 'Every inspection and violation, out-of-service rates against the national average, and crashes.',
  },
  equipment: {
    icon: Truck,
    title: 'Equipment',
    text: 'The trucks and trailers seen on inspections, decoded from their VINs.',
  },
  report: {
    icon: FileText,
    title: 'Safety Score Report',
    text: 'A dated report to print or save as a PDF.',
  },
  history: {
    icon: History,
    title: 'History',
    text: 'Changes to the carrier’s record over time: name, address, phone, officers and more.',
  },
} satisfies Record<string, Item>

const ITEMS: Record<Audience, { title: ReactNode; aside: string; items: Item[] }> = {
  carrier: {
    title: (
      <>
        Everything in your <Accent>carrier portal</Accent>
      </>
    ),
    aside: 'Sign up with your USDOT number and all of this opens for your carrier straight away.',
    items: [
      {
        icon: LayoutDashboard,
        title: 'Your home page',
        text: 'A snapshot of each of your carriers the moment you log in.',
      },
      COMMON.overview,
      COMMON.authority,
      {
        ...COMMON.inspections,
        text: 'Every inspection and violation, the 49 CFR rule behind each, out-of-service rates and crashes.',
      },
      COMMON.equipment,
      {
        icon: Eye,
        title: 'How brokers see you',
        text: 'Phones, emails or addresses shared with other carriers that a broker’s fraud screen may flag.',
      },
      { ...COMMON.report, text: 'A dated report to send brokers and shippers before they ask.' },
      {
        icon: BriefcaseBusiness,
        title: 'Compliance services',
        text: 'Order filings from Sky Transport Solutions: UCR, authority reactivation, drug & alcohol consortium, driver files and more.',
      },
      {
        icon: Scale,
        title: 'DataQs challenges',
        text: 'Ask to correct a wrong inspection or violation and follow the case to the decision.',
      },
      {
        icon: Receipt,
        title: 'Invoices',
        text: 'See and pay your Sky Transport Solutions invoices online.',
      },
      COMMON.history,
      PLAN,
    ],
  },
  broker: {
    title: (
      <>
        Everything in your <Accent>broker portal</Accent>
      </>
    ),
    aside: 'Look up any carrier and get the full picture, tab by tab, before you give it a load.',
    items: [
      {
        icon: Search,
        title: 'Search any carrier',
        text: 'By USDOT, MC number or name. A carrier you haven’t looked up before loads in seconds.',
      },
      {
        icon: BadgeCheck,
        title: 'Booking check',
        text: 'Ready to book, Book with review, High risk or Do not book, with the reasons, on top of every carrier.',
      },
      COMMON.overview,
      COMMON.authority,
      COMMON.inspections,
      COMMON.equipment,
      {
        icon: Network,
        title: 'Linked carriers',
        text: 'Carriers that share a phone, email or address, and links to revoked USDOT numbers.',
      },
      {
        icon: ScanSearch,
        title: 'Chameleon check',
        text: 'Signs a carrier re-registered under a new name and USDOT to leave a revocation behind.',
      },
      {
        icon: Columns3,
        title: 'Compare carriers',
        text: 'Up to 3 carriers side by side: authority, insurance, safety score, crashes and red flags.',
      },
      {
        ...COMMON.report,
        text: 'A dated report to save with the load, so you can show what you checked.',
      },
      COMMON.history,
      PLAN,
    ],
  },
  agent: {
    title: (
      <>
        Everything in your <Accent>agent portal</Accent>
      </>
    ),
    aside:
      'Look up any carrier you are quoting and see its filings, safety and fleet in one place.',
    items: [
      {
        icon: Search,
        title: 'Search any carrier',
        text: 'By USDOT, MC number or name. A carrier you haven’t looked up before loads in seconds.',
      },
      COMMON.overview,
      COMMON.authority,
      COMMON.inspections,
      COMMON.equipment,
      {
        icon: Network,
        title: 'Linked carriers',
        text: 'Carriers that share a phone, email or address, and links to revoked USDOT numbers.',
      },
      {
        icon: ScanSearch,
        title: 'Chameleon check',
        text: 'Signs a carrier re-registered under a new name and USDOT to leave a revocation behind.',
      },
      {
        icon: Columns3,
        title: 'Compare carriers',
        text: 'Up to 3 carriers side by side: authority, insurance, safety score, crashes and red flags.',
      },
      { ...COMMON.report, text: 'A dated report to keep in the quote file.' },
      COMMON.history,
      PLAN,
    ],
  },
}

/** "Everything in your portal": one tile per tab or page the audience's portal has. */
export function PortalFeatures({ audience, number }: { audience: Audience; number?: string }) {
  const { title, aside, items } = ITEMS[audience]
  return (
    <div>
      <SectionHeading number={number} eyebrow="Inside the portal" title={title} aside={aside} />
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const { icon: Icon, title, text } = item
          return (
            <motion.li
              key={title}
              {...reveal((i % 3) * 0.06)}
              className={`flex gap-4 rounded-2xl border p-5 transition-colors ${
                item === PLAN
                  ? 'border-accent-strong/40 bg-accent-strong/5'
                  : 'border-slate-200 bg-surface hover:border-slate-300'
              }`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            </motion.li>
          )
        })}
      </ul>
      <div className="mt-10 flex justify-center">
        <Link
          to={`${AUDIENCE_PATH[audience]}/portal`}
          className="group inline-flex items-center gap-2 rounded-full bg-[#101853] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#1e3a8a]"
        >
          See every page of the portal, with sample screens
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      </div>
    </div>
  )
}
