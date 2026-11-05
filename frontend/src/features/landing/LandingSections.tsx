import { BadgeCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'

import reportPage1 from '../../assets/report-sample-1.webp'
import reportPage2 from '../../assets/report-sample-2.webp'
import stsLogo from '../carrier-profile/packet/sts-logo.png'
import { Accent, reveal, SectionHeading } from './landingParts'
import { FileArt, FindArt, FollowArt } from './RoleArt'
import { MembershipsStrip } from './StsVoices'

/** From skytransportsolutions.com. Only what its pages agree on: no client counts or rankings. */
const STS_FOUNDED = 2013
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
/** What the hero search looks for: a chip picks one, so the box shows a matching example. */
const SEARCH_MODES = [
  { id: 'usdot', label: 'USDOT number', placeholder: 'e.g. 2814323' },
  { id: 'mc', label: 'MC number', placeholder: 'e.g. 852168' },
  { id: 'name', label: 'Company name', placeholder: 'e.g. ACME Hauling' },
] as const
type SearchMode = (typeof SEARCH_MODES)[number]['id']

export function HeroTryForm({ centered = false }: { centered?: boolean }) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    let value = query.trim()
    // The MC chip: a bare number is an MC number, not a USDOT one.
    if (mode === 'mc' && /^\d+$/.test(value)) value = `MC ${value}`
    navigate(value ? `/try?q=${encodeURIComponent(value)}` : '/try')
  }

  function pick(id: SearchMode) {
    setMode((m) => (m === id ? null : id))
    input.current?.focus()
  }

  const placeholder =
    SEARCH_MODES.find((m) => m.id === mode)?.placeholder ?? 'USDOT, MC number or company name'

  return (
    <form
      onSubmit={submit}
      className={`mx-auto w-full ${centered ? 'max-w-xl' : 'max-w-md lg:mx-0'}`}
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-surface/90 p-2 shadow-lg backdrop-blur sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">USDOT number, MC number or company name</span>
          <input
            ref={input}
            placeholder={placeholder}
            inputMode={mode === 'usdot' || mode === 'mc' ? 'numeric' : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl bg-transparent px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--hero-cta)] px-5 py-3 text-sm font-medium text-[var(--hero-cta-ink)] transition-colors hover:bg-[var(--hero-cta-hover)]"
        >
          Free trial
        </button>
      </div>
      <div
        role="group"
        aria-label="Search by"
        className={`mt-3 flex flex-wrap items-center justify-center gap-2 ${centered ? '' : 'lg:justify-start'}`}
      >
        <span className="text-xs text-white/80">Search by</span>
        {SEARCH_MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            aria-pressed={mode === id}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
              mode === id
                ? 'bg-white text-slate-950 ring-white'
                : 'bg-white/10 text-white ring-white/30 hover:bg-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={`mt-2.5 text-center text-xs text-white/90 ${centered ? '' : 'lg:text-left'}`}>
        One free search, no account needed.
      </p>
    </form>
  )
}

const DATAQS_STEPS: { art: () => ReactElement; title: string; text: string }[] = [
  {
    art: FindArt,
    title: 'Find it',
    text: 'See every inspection and violation on your record, with the ones weighing most on your score first.',
  },
  {
    art: FileArt,
    title: 'We file it',
    text: 'Choose the inspection and an STS specialist prepares and files the DataQs challenge with you.',
  },
  {
    art: FollowArt,
    title: 'Follow it',
    text: 'Track your case in your portal. The agency reviewing the record makes the final decision.',
  },
]

/** The service that sets Carrier Safety Scan apart: STS files the challenge. */
export function DataQsSection({ number }: { number?: string }) {
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="DataQs challenges"
        title={
          <>
            Found a wrong violation? <Accent>Our specialists challenge it</Accent> for you.
          </>
        }
        aside="A violation cited by mistake counts against your safety record until it’s corrected. If a challenge is accepted, the violation is removed and stops counting."
      />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {DATAQS_STEPS.map(({ art: Art, title, text }, i) => (
          <motion.article
            key={title}
            {...reveal(i * 0.05)}
            className="rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl shadow-black/20"
          >
            <div className="-mx-6 -mt-6 mb-1 h-32 overflow-hidden rounded-t-2xl">
              <Art />
            </div>
            <h3 className="mt-5 text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
          </motion.article>
        ))}
      </div>
    </div>
  )
}

/** Two real pages of the report, for a made-up carrier (no identifying details). */
export function ReportPreview({
  number,
  aside = 'A clear, printable report on a carrier: the Estimated ISS, each safety category, what’s hurting the score, and plain-English steps to improve it.',
}: {
  number?: string
  aside?: string
}) {
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="See what you get"
        title={
          <>
            The <Accent>Safety Score Report</Accent>
          </>
        }
        aside={aside}
      />
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
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
        Sample report with example data for a made-up carrier. The Estimated ISS is Carrier Safety
        Scan’s estimate, not FMCSA’s official score or a safety rating.
      </motion.p>
    </div>
  )
}

/** Who stands behind the app; how to reach them is in the footer. DataQs is for carriers only. */
export function AboutStsSection({ dataQs = false }: { dataQs?: boolean }) {
  return (
    <div>
      <SectionHeading
        eyebrow="Who’s behind this"
        title={
          <>
            Built by <Accent>Sky Transport Solutions</Accent>
          </>
        }
      />
      <motion.div
        {...reveal()}
        className="mt-10 grid gap-6 rounded-3xl border border-slate-200 bg-surface/90 p-6 sm:p-10 md:grid-cols-[auto_1fr]"
      >
        <img src={stsLogo} alt="Sky Transport Solutions" className="h-16 w-auto object-contain" />
        <div>
          <p className="text-sm leading-relaxed text-slate-700 md:text-base">
            Carrier Safety Scan is built by Sky Transport Solutions, a trucking compliance company
            founded in {STS_FOUNDED}. STS helps trucking companies across the United States with
            registration, permits and DOT compliance
            {dataQs ? ', and it’s the team that handles your DataQs challenges.' : '.'}
          </p>
          <ul className="mt-6 grid gap-x-5 gap-y-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            {STS_SERVICES.map((service) => (
              <li key={service} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
                {service}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
      <MembershipsStrip />
    </div>
  )
}
