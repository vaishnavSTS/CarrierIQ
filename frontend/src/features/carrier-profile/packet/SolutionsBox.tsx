import { useContext } from 'react'

import { PrintCopy } from './printFit'
import { SectionHeading } from './SectionHeading'
import type { Solution } from './solutions'

/**
 * Page 2's plan in plain English: numbered steps, each with what to do and how. Two columns on
 * paper (the printed copy is laid out at the A4 width whatever the screen), one on a phone.
 */
export function SolutionsBox({ steps }: { steps: Solution[] }) {
  const printed = useContext(PrintCopy)
  if (steps.length === 0) return null
  return (
    <div className="space-y-2">
      <SectionHeading aside="Suggestions from this report’s FMCSA records" tone="green">
        <span className="text-emerald-800">Solutions on improving the Safety Score</span>
      </SectionHeading>
      <ol
        className={`grid gap-2 ${printed ? 'grid-cols-2' : 'sm:grid-cols-2'}`}
        aria-label="Steps to improve the Safety Score"
      >
        {steps.map((s, n) => (
          <li
            key={s.key}
            className="flex break-inside-avoid gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
              {n + 1}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-900">{s.title}</div>
              <p className="mt-0.5 text-xs leading-snug text-slate-700">{s.how}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-slate-500">
        The score is recalculated when FMCSA updates its data each month; it depends on future
        inspections, so no step guarantees a result.
      </p>
    </div>
  )
}
