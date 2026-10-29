import type { ReactNode } from 'react'

export type HeadingTone = 'neutral' | 'red' | 'amber' | 'green'

/** The bar's colour says what the section is: a problem, worth watching, good, or plain record. */
const BAR: Record<HeadingTone, string> = {
  neutral: 'border-l-accent',
  red: 'border-l-red-600',
  amber: 'border-l-amber-500',
  green: 'border-l-emerald-600',
}

/**
 * A section title in the Safety Score Report: a coloured bar on the left, a rule underneath, and
 * an optional grey source note on the right, so each section stands out when skimming the PDF.
 */
export function SectionHeading({
  children,
  aside,
  tone = 'neutral',
}: {
  children: ReactNode
  aside?: ReactNode
  tone?: HeadingTone
}) {
  return (
    <h2
      className={`flex flex-wrap items-baseline justify-between gap-x-3 border-b border-l-4 border-b-slate-200 pb-1 pl-2.5 text-[17px] font-semibold tracking-tight text-slate-900 ${BAR[tone]}`}
    >
      {children}
      {aside && <span className="text-xs font-normal text-slate-500">{aside}</span>}
    </h2>
  )
}
