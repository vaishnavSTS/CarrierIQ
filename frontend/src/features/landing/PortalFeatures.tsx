import { ArrowRight } from 'lucide-react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AUDIENCE_PATH, type Audience } from '../audience/audience'
import { Accent, SectionHeading } from './landingParts'

/** Colour of a tile's sample chip (theme tokens, so dark mode follows). */
type Tone = 'violet' | 'sky' | 'emerald' | 'amber'

const TONE: Record<Tone, { chip: string; dot: string }> = {
  violet: {
    chip: 'bg-accent-soft text-accent-strong',
    dot: 'bg-accent',
  },
  sky: { chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-600' },
  emerald: {
    chip: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-600',
  },
  amber: {
    chip: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-600',
  },
}

/** One tab or page of the portal; `sample` is a short example of what it shows. */
type Item = { title: string; text: string; sample: string; tone: Tone }

/**
 * Everything each portal includes, tab by tab (pages/CarrierProfilePage.tsx CLIENT_TABS /
 * BROKER_TABS, router.tsx). Keep in step with the app: only what a new account actually gets.
 * The samples are illustrations, like the example carrier on the page.
 */
const PLAN: Item = {
  title: 'Free for 30 days',
  text: 'Every part of the portal, free for 30 days from sign-up. No card needed to start.',
  sample: 'No card needed',
  tone: 'violet',
}

const COMMON = {
  overview: {
    title: 'Overview and safety score',
    text: 'Company details and the Estimated ISS, 1–100, with the safety category that drives it.',
    sample: 'Estimated ISS 42 · Satisfactory',
    tone: 'emerald',
  },
  authority: {
    title: 'Authority & Insurance',
    text: 'Is the MC active, is liability and cargo insurance on file, the BOC-3 filing and any revocations.',
    sample: 'MC active · $1M liability on file',
    tone: 'emerald',
  },
  inspections: {
    title: 'Inspections',
    text: 'Every inspection and violation, out-of-service rates against the national average, and crashes.',
    sample: '31 inspections · last 24 months',
    tone: 'sky',
  },
  equipment: {
    title: 'Equipment',
    text: 'The trucks and trailers seen on inspections, decoded from their VINs.',
    sample: '12 trucks · VINs decoded',
    tone: 'sky',
  },
  report: {
    title: 'Safety Score Report',
    text: 'A dated report to print or save as a PDF.',
    sample: 'PDF · dated today',
    tone: 'violet',
  },
  history: {
    title: 'History',
    text: 'Changes to the carrier’s record over time: name, address, phone, officers and more.',
    sample: 'Address changed · Mar 2026',
    tone: 'sky',
  },
  linked: {
    title: 'Linked carriers',
    text: 'Carriers that share a phone, email or address, and links to revoked USDOT numbers.',
    sample: '2 shared contacts found',
    tone: 'amber',
  },
  chameleon: {
    title: 'Chameleon check',
    text: 'Signs a carrier re-registered under a new name and USDOT to leave a revocation behind.',
    sample: 'No signs found',
    tone: 'emerald',
  },
  compare: {
    title: 'Compare carriers',
    text: 'Up to 3 carriers side by side: authority, insurance, safety score, crashes and red flags.',
    sample: '3 carriers side by side',
    tone: 'sky',
  },
  search: {
    title: 'Search any carrier',
    text: 'By USDOT, MC number or name. A carrier you haven’t looked up before loads in seconds.',
    sample: 'USDOT · MC · company name',
    tone: 'violet',
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
        title: 'Your home page',
        text: 'A snapshot of each of your carriers the moment you log in.',
        sample: 'Checked just now',
        tone: 'violet',
      },
      COMMON.overview,
      COMMON.authority,
      {
        ...COMMON.inspections,
        text: 'Every inspection and violation, the 49 CFR rule behind each, out-of-service rates and crashes.',
      },
      COMMON.equipment,
      {
        title: 'How brokers see you',
        text: 'Phones, emails or addresses shared with other carriers that a broker’s fraud screen may flag.',
        sample: '1 shared phone number',
        tone: 'amber',
      },
      { ...COMMON.report, text: 'A dated report to send brokers and shippers before they ask.' },
      {
        title: 'Compliance services',
        text: 'Order filings from Sky Transport Solutions: UCR, authority reactivation, drug & alcohol consortium, driver files and more.',
        sample: 'UCR · order online',
        tone: 'violet',
      },
      {
        title: 'DataQs challenges',
        text: 'Ask to correct a wrong inspection or violation and follow the case to the decision.',
        sample: 'Case filed · under review',
        tone: 'amber',
      },
      {
        title: 'Invoices',
        text: 'See and pay your Sky Transport Solutions invoices online.',
        sample: 'Pay by card online',
        tone: 'emerald',
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
      COMMON.search,
      {
        title: 'Booking check',
        text: 'Ready to book, Book with review, High risk or Do not book, with the reasons, on top of every carrier.',
        sample: 'Ready to book',
        tone: 'emerald',
      },
      COMMON.overview,
      COMMON.authority,
      COMMON.inspections,
      COMMON.equipment,
      COMMON.linked,
      COMMON.chameleon,
      COMMON.compare,
      {
        ...COMMON.report,
        text: 'A dated report to save with the load, so you can show what you checked.',
        sample: 'Saved with the load',
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
      COMMON.search,
      COMMON.overview,
      COMMON.authority,
      COMMON.inspections,
      COMMON.equipment,
      COMMON.linked,
      COMMON.chameleon,
      COMMON.compare,
      {
        ...COMMON.report,
        text: 'A dated report to keep in the quote file.',
        sample: 'Kept in the quote file',
      },
      COMMON.history,
      PLAN,
    ],
  },
}

/** How long the spotlight stays on each tile before gliding to the next. */
const SPOTLIGHT_MS = 2600

/**
 * "Everything in your portal": one tile per tab or page the audience's portal has, each with its
 * sample of what it shows. Tiles spring in as the grid scrolls into view, then a
 * spotlight glides from tile to tile; pointing at a tile moves the spotlight there and pauses it.
 * With reduced motion the tiles simply appear and nothing moves on its own.
 */
export function PortalFeatures({ audience, number }: { audience: Audience; number?: string }) {
  const { title, aside, items } = ITEMS[audience]
  const reduce = useReducedMotion() ?? false
  const grid = useRef<HTMLUListElement>(null)
  const inView = useInView(grid, { margin: '-80px' })
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reduce || paused || !inView) return
    const timer = window.setInterval(() => setActive((i) => (i + 1) % items.length), SPOTLIGHT_MS)
    return () => window.clearInterval(timer)
  }, [reduce, paused, inView, items.length])

  return (
    <div>
      <SectionHeading number={number} eyebrow="Inside the portal" title={title} aside={aside} />
      <ul
        ref={grid}
        className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onPointerLeave={() => setPaused(false)}
      >
        {items.map((item, i) => (
          <Tile
            key={item.title}
            item={item}
            index={i}
            plan={item === PLAN}
            lit={!reduce && i === active}
            reduce={reduce}
            spotlightId={`portal-spotlight-${audience}`}
            onPoint={() => {
              setPaused(true)
              setActive(i)
            }}
          />
        ))}
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

function Tile({
  item,
  index,
  plan,
  lit,
  reduce,
  spotlightId,
  onPoint,
}: {
  item: Item
  index: number
  plan: boolean
  /** The spotlight is on this tile */
  lit: boolean
  reduce: boolean
  spotlightId: string
  onPoint: () => void
}) {
  const { title, text, sample } = item
  const tone = TONE[item.tone]

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={
        reduce
          ? { duration: 0.3 }
          : {
              type: 'spring',
              stiffness: 260,
              damping: 24,
              delay: (index % 3) * 0.08 + Math.floor(index / 3) * 0.05,
            }
      }
      whileHover={reduce ? undefined : { y: -4 }}
      onPointerEnter={onPoint}
      className={`group relative flex flex-col rounded-2xl border p-5 transition-shadow duration-300 ${
        plan
          ? 'border-accent-strong/40 bg-accent-strong/5'
          : 'border-slate-200 bg-surface hover:shadow-lg'
      } ${lit ? 'shadow-lg' : ''}`}
    >
      {lit && (
        <motion.span
          layoutId={spotlightId}
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-accent/70 shadow-[0_0_0_6px_var(--color-accent-soft)]"
          transition={{ type: 'spring', stiffness: 220, damping: 28 }}
        />
      )}

      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>

      <div className="mt-auto pt-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.chip}`}
        >
          <span aria-hidden className="relative flex size-1.5">
            {lit && (
              <span
                className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${tone.dot}`}
              />
            )}
            <span className={`relative inline-flex size-1.5 rounded-full ${tone.dot}`} />
          </span>
          {sample}
        </span>
      </div>
    </motion.li>
  )
}
