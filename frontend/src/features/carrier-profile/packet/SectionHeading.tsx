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
 * A section title in the Safety Score Report: a coloured bar on the left and a rule underneath, so
 * each section stands out when skimming the PDF.
 */
export function SectionHeading({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: HeadingTone
}) {
  return (
    <h2
      className={`border-b border-l-4 border-b-slate-200 pb-1 pl-2.5 text-[19px] font-semibold tracking-tight text-slate-950 ${BAR[tone]}`}
    >
      {children}
    </h2>
  )
}
