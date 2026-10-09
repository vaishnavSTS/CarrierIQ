import type { ReactNode } from 'react'

import { SourceTag } from '../../components/SourceTag'

export function Section({
  id,
  title,
  source,
  children,
}: {
  id: string
  title: string
  /** Where the section's information comes from */
  source?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-lg border border-slate-200 bg-surface">
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        {title}
        {source && <SourceTag>{source}</SourceTag>}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** A label/value pair in a definition grid. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>
}

/** A headline number with a label, e.g. inspection count. */
export function Stat({
  label,
  value,
  note,
  source,
}: {
  label: string
  value: ReactNode
  note?: string
  /** Where the value comes from; shown at the bottom so boxes in a row line up */
  source?: string
}) {
  return (
    <div className="flex h-full flex-col rounded-md border border-slate-200 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
      {source && (
        <div className="mt-auto pt-1.5">
          <SourceTag>{source}</SourceTag>
        </div>
      )}
    </div>
  )
}
