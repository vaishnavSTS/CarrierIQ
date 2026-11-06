import { useContext } from 'react'

import { PrintCopy } from './printFit'
import { SectionHeading } from './SectionHeading'
import type { Solution } from './solutions'

/**
 * The report's plan in plain English: numbered steps, each with what to do and how. Two columns on
 * paper (the printed copy is laid out at the A4 width whatever the screen), one on a phone.
 */
export function SolutionsBox({
  steps,
  title = 'Solutions on improving the Safety Score',
}: {
  steps: Solution[]
  title?: string
}) {
  const printed = useContext(PrintCopy)
  if (steps.length === 0) return null
  return (
    <div className="space-y-2">
      <SectionHeading tone="green">{title}</SectionHeading>
      <ol
        className={`grid gap-2 ${printed ? 'grid-cols-2' : 'wide:grid-cols-2'}`}
        aria-label="Steps to improve the Safety Score"
      >
        {steps.map((s, n) => (
          <li
            key={s.key}
            className="flex break-inside-avoid gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-700 text-[11px] font-bold text-surface">
              {n + 1}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-900">{s.title}</div>
              <p className="mt-0.5 text-xs leading-snug text-slate-700">{s.how}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
