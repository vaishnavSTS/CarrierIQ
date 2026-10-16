import {
  Ban,
  CircleAlert,
  CircleCheck,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  TriangleAlert,
} from 'lucide-react'

import { StatusBadge } from '../../components/StatusBadge'
import type { CarrierFacts } from './useComparison'
import {
  MINOR_LIMIT,
  NEW_AUTHORITY_MONTHS,
  THIN_RECORD,
  VERDICT,
  type Ranked,
  type VetItem,
} from './vetting'

const name = (f: CarrierFacts) => f.profile?.legal_name ?? `USDOT ${f.usdot}`

function Items({
  items,
  icon: Icon,
  className,
}: {
  items: VetItem[]
  icon: typeof Ban
  className: string
}) {
  if (!items.length) return null
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.key} className={`flex items-start gap-1.5 ${className}`}>
          <Icon className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Under each carrier's name: its verdict, place, and every item behind it. */
export function VerdictCard({ ranked }: { ranked: Ranked }) {
  const v = ranked.vetting
  if (!v) return null
  const best = ranked.rank === 1
  const border =
    v.verdict === 'do_not_book'
      ? 'border-red-200 bg-red-50'
      : best
        ? 'border-emerald-600/60 bg-emerald-50'
        : 'border-slate-200 bg-slate-50'
  return (
    <div className={`space-y-1.5 rounded-md border px-2 py-1.5 text-xs ${border}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge label={VERDICT[v.verdict].label} tone={VERDICT[v.verdict].tone} />
        {best && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <Trophy className="size-3.5" aria-hidden />
            Best pick
          </span>
        )}
        {ranked.rank !== null && !best && (
          <span className="font-semibold text-slate-700">#{ranked.rank} choice</span>
        )}
      </div>
      <Items items={v.stops} icon={Ban} className="text-red-700" />
      <Items items={v.major} icon={CircleAlert} className="text-red-700" />
      <Items items={v.minor} icon={TriangleAlert} className="text-amber-700" />
      <Items items={v.strengths} icon={CircleCheck} className="text-emerald-700" />
      {v.verdict === 'ready' && v.strengths.length === 0 && (
        <p className="text-slate-600">No caution items in the public records.</p>
      )}
    </div>
  )
}

/** Top of the page: who to give the load to, and why the others rank lower. */
export function VerdictSummary({ facts, ranked }: { facts: CarrierFacts[]; ranked: Ranked[] }) {
  const best = facts.filter((_, i) => ranked[i].rank === 1)
  const top = best.length ? ranked[facts.indexOf(best[0])].vetting! : null
  const cautions = top ? top.major.length + top.minor.length : 0

  return (
    <div className="space-y-2 rounded-xl border border-accent-soft bg-accent-soft/40 px-4 py-3 text-sm text-slate-800">
      <p className="flex items-start gap-2">
        {top ? (
          <Trophy className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        )}
        {!top ? (
          <span>
            <span className="font-semibold">No carrier here is ready to book.</span> Each is high
            risk or fails a hard stop; the items are listed under each name.
          </span>
        ) : best.length > 1 ? (
          <span>
            Tied for best pick:{' '}
            <span className="font-semibold">{best.map(name).join(' and ')}</span> (
            {VERDICT[top.verdict].label.toLowerCase()}). Compare the lines below.
          </span>
        ) : (
          <span>
            <>
              Best pick: <span className="font-semibold">{name(best[0])}</span>:{' '}
              {VERDICT[top.verdict].label.toLowerCase()}
              {cautions
                ? `, ${cautions} caution item${cautions === 1 ? '' : 's'} to note (listed under its name).`
                : ', no caution items in the public records.'}
            </>
          </span>
        )}
      </p>
      {facts.map((f, i) => {
        const v = ranked[i].vetting
        if (!v || ranked[i].rank === 1) return null
        const why = v.stops[0] ?? v.major[0]
        if (v.verdict === 'do_not_book' || v.verdict === 'high_risk') {
          return (
            <p
              key={f.usdot}
              className={v.verdict === 'do_not_book' ? 'text-red-700' : 'text-amber-700'}
            >
              {name(f)}: {VERDICT[v.verdict].label.toLowerCase()}
              {why
                ? `, ${why.text.charAt(0).toLowerCase()}${why.text.slice(1)}`
                : `, ${v.minor.length} caution items`}
              .
            </p>
          )
        }
        return null
      })}
      <p className="text-xs text-slate-500">
        How each verdict is decided is explained at the bottom of the page.
      </p>
    </div>
  )
}

/** Bottom of the page: the whole rule, so a broker can see (and file) why a carrier ranks where it does. */
export function HowWeDecide() {
  const steps = [
    {
      icon: Ban,
      tone: 'text-red-700',
      title: '1. Hard stops',
      result: 'Do not book',
      body: 'Any one of these and the carrier shouldn’t get the load:',
      items: [
        'Operating authority not active, or revocation pending',
        'Active FMCSA out-of-service order',
        'Unsatisfactory FMCSA safety rating',
        'No liability insurance on file, or below the legal minimum ($750,000 for general freight)',
      ],
    },
    {
      icon: ShieldAlert,
      tone: 'text-red-700',
      title: '2. Major caution items',
      result: 'High risk',
      body: 'Any one of these makes the carrier high risk:',
      items: [
        'Conditional FMCSA safety rating (the Supreme Court’s 2026 Montgomery case turned on one)',
        'Over threshold in Unsafe Driving, HOS Compliance or Crash Indicator',
        'Vehicle or driver out-of-service rate twice the national average or more (3+ inspections)',
        'Estimated ISS 75 or higher (High risk)',
        'Contact details shared with a revoked carrier, or other red broker flags',
        'Authority under 12 months with 10 or more power units (a common fraud sign)',
        'A fatal crash in the last 24 months',
      ],
    },
    {
      icon: TriangleAlert,
      tone: 'text-amber-700',
      title: '3. Minor caution items',
      result: `Book with review (1–${MINOR_LIMIT - 1}) · High risk (${MINOR_LIMIT}+)`,
      body: 'Bookable, but write down why you accepted each one:',
      items: [
        `Authority under ${NEW_AUTHORITY_MONTHS} months old, or no grant date on record`,
        'Authority revoked in the last 3 years (since reinstated)',
        'Liability under $1,000,000 (what most brokers require)',
        'Insurance renewal due within 30 days',
        `Fewer than ${THIN_RECORD} inspections in 24 months: a thin record isn’t a clean one`,
        'Estimated ISS 50–74 (At risk)',
        'Over threshold in another safety category (e.g. Vehicle Maintenance)',
        'Vehicle or driver out-of-service rate above the national average (under twice)',
        'An injury crash in the last 24 months',
        'Registration items to fix (MCS-150, BOC-3, FMCSA registration system), counted once',
      ],
    },
    {
      icon: ShieldCheck,
      tone: 'text-emerald-700',
      title: '4. Strengths',
      result: 'Ready to book, when there are no caution items',
      body: 'These move a carrier up among carriers with the same verdict:',
      items: [
        'Authority 3 years or older',
        'Satisfactory FMCSA safety rating',
        '10+ inspections with out-of-service rates below the national average',
        '$1,000,000 or more liability on file',
      ],
    },
  ]

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Scale className="size-5 text-accent-strong" aria-hidden />
          How CarrierIQ decides which carrier to prioritize
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The same checks brokers run before giving a load, applied in order to FMCSA’s public
          records. Each carrier gets a verdict. Only carriers rated Ready to book or Book with
          review are ranked; the best of them is the best pick.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {steps.map((step) => (
          <div key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${step.tone}`}>
                <step.icon className="size-4" aria-hidden />
                {step.title}
              </h3>
              <span className="text-xs font-medium text-slate-500">→ {step.result}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{step.body}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
              {step.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Tie-breakers, in order</p>
        <p className="mt-1">
          Ready to book before Book with review → fewer major items → fewer minor items → more
          strengths → lower Estimated ISS → older authority.
        </p>
      </div>

      <div className="rounded-xl border border-amber-700/40 bg-amber-50 p-4 text-xs text-slate-700">
        <p className="font-semibold text-amber-700">Still on you before the load</p>
        <p className="mt-1">
          Public records can’t show these: confirm the insurance certificate with the insurer
          (including cargo cover), verify the carrier’s identity and contact details, get the W-9
          and signed carrier agreement, and check the equipment and your own history with the
          carrier. Thresholds such as 6 months of authority and $1M liability are common broker
          practice, not law; your brokerage’s own policy comes first.
        </p>
      </div>
    </section>
  )
}
