import { Columns3, Link2, ListOrdered, Medal, Search, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { Accent, reveal, SectionHeading } from './landingParts'

/*
 * The broker and insurance agent pages' Compare section: how the Compare page works
 * (pages/ComparePage.tsx) beside a sample comparison of three made-up carriers. Brokers get the
 * booking grade and a ranking; agents compare without them, as in the app. Keep in step with
 * ComparePage: up to 3 carriers, lines grouped as there, the best value on each line highlighted,
 * high-risk and do-not-book carriers never ranked, and a link to share.
 */

type Who = 'broker' | 'agent'

type Carrier = {
  name: string
  usdot: string
  grade: { label: string; style: string }
  rank: string | null
}

const CARRIERS: Carrier[] = [
  {
    name: 'Example Freight LLC',
    usdot: '1234567',
    grade: { label: 'Ready to book', style: 'bg-emerald-100 text-emerald-800' },
    rank: '1st',
  },
  {
    name: 'Sample Hauling Co',
    usdot: '2345678',
    grade: { label: 'Book with review', style: 'bg-amber-100 text-amber-900' },
    rank: '2nd',
  },
  {
    name: 'Demo Lines Inc',
    usdot: '3456789',
    grade: { label: 'High risk', style: 'bg-red-100 text-red-800' },
    rank: null,
  },
]

/** Sample lines; `best` is the column highlighted, as the Compare page marks the best value. */
const ROWS: { group: string; label: string; values: string[]; best: number[] }[] = [
  {
    group: 'Authority and insurance',
    label: 'Authority',
    values: ['Active, 6 yrs', 'Active, 4 mo', 'Active, 2 yrs'],
    best: [0],
  },
  {
    group: 'Authority and insurance',
    label: 'Liability on file',
    values: ['$1,000,000', '$1,000,000', '$750,000'],
    best: [0, 1],
  },
  {
    group: 'Safety record',
    label: 'Estimated ISS',
    values: ['42', '58', '81'],
    best: [0],
  },
  {
    group: 'Safety record',
    label: 'Vehicle out of service',
    values: ['14.8%', '19.6%', '41.0%'],
    best: [0],
  },
  {
    group: 'Safety record',
    label: 'Crashes, 24 months',
    values: ['1', '0', '3'],
    best: [1],
  },
  {
    group: 'Red flags',
    label: 'Red flags',
    values: ['None', 'New authority', 'Shared phone'],
    best: [0],
  },
]

const STEPS: Record<Who, { icon: LucideIcon; title: string; text: string }[]> = {
  broker: [
    {
      icon: Search,
      title: 'Add up to 3 carriers',
      text: 'Press Compare on any carrier you look up; they wait in a tray at the bottom of the screen.',
    },
    {
      icon: Columns3,
      title: 'Side by side, line by line',
      text: 'Authority and insurance, safety record, red flags and fleet, with the best value on each line highlighted.',
    },
    {
      icon: Medal,
      title: 'A grade and a ranking',
      text: 'Each carrier gets its booking grade, and the bookable ones are ranked. High-risk and do-not-book carriers are never ranked.',
    },
    {
      icon: Link2,
      title: 'Share it',
      text: 'Copy a link to the comparison to send a colleague or keep with the load.',
    },
  ],
  agent: [
    {
      icon: Search,
      title: 'Add up to 3 carriers',
      text: 'Press Compare on any carrier you look up, such as the risks you’re quoting this week.',
    },
    {
      icon: Columns3,
      title: 'Side by side, line by line',
      text: 'Filings and authority, safety record, crashes, red flags and fleet, with the best value on each line highlighted.',
    },
    {
      icon: ListOrdered,
      title: 'The facts, no verdict',
      text: 'For agents the comparison shows the record only; how each risk is rated stays your call.',
    },
    {
      icon: Link2,
      title: 'Share it',
      text: 'Copy a link to the comparison to send to an underwriter or keep with the quote.',
    },
  ],
}

function SampleTable({ who }: { who: Who }) {
  const grades = who === 'broker'
  let lastGroup = ''
  return (
    <motion.div
      {...reveal(0.1)}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-surface shadow-2xl shadow-brand-glow/15"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <span className="font-label text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
          Compare · 3 of 3
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
          Sample carriers · example data
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr>
              <th className="w-[30%] px-4 py-3" />
              {CARRIERS.map((c) => (
                <th key={c.usdot} className="px-3 py-3 text-left align-top font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-tight text-slate-900">{c.name}</span>
                    {grades && c.rank && (
                      <span className="shrink-0 rounded-full bg-[#101853] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                        {c.rank}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">USDOT {c.usdot}</div>
                  {grades && (
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.grade.style}`}
                    >
                      {c.grade.label}
                    </span>
                  )}
                  {grades && !c.rank && (
                    <div className="mt-1 text-[10.5px] text-slate-500">Not ranked</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.flatMap((row) => {
              const out = []
              if (row.group !== lastGroup) {
                lastGroup = row.group
                out.push(
                  <tr key={`g-${row.group}`}>
                    <td
                      colSpan={4}
                      className="font-label bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                    >
                      {row.group}
                    </td>
                  </tr>,
                )
              }
              out.push(
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-600">{row.label}</td>
                  {row.values.map((value, i) => {
                    const best = row.best.includes(i)
                    return (
                      <td
                        key={i}
                        className={`px-3 py-2.5 tabular-nums text-slate-800 ${best ? 'bg-emerald-50 shadow-[inset_3px_0_0_var(--color-emerald-600)]' : ''}`}
                      >
                        {value}
                        {best && (
                          <span className="ml-1.5 rounded bg-emerald-600 px-1 py-px text-[9.5px] font-semibold uppercase text-surface">
                            Best
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>,
              )
              return out
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

export function CompareShowcase({ who, number }: { who: Who; number?: string }) {
  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="Compare carriers"
        title={
          who === 'broker' ? (
            <>
              Three carriers for one load? <Accent>See them side by side</Accent>
            </>
          ) : (
            <>
              Weigh risks <Accent>side by side</Accent>
            </>
          )
        }
        aside={
          who === 'broker'
            ? 'Put up to 3 carriers next to each other and see which one the record favours, line by line.'
            : 'Put up to 3 carriers next to each other and see how their records differ, line by line.'
        }
      />
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1fr_1.45fr]">
        <ol className="space-y-5">
          {STEPS[who].map(({ icon: Icon, title, text }, i) => (
            <motion.li key={title} {...reveal(i * 0.06)} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-amber-300">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <SampleTable who={who} />
      </div>
    </div>
  )
}
