import type { ReactNode } from 'react'

import { SourceTag } from '../../components/SourceTag'

/**
 * One status box in the profile header. The header lays these out in a grid, so every box in a
 * row has the same height; the source sits at the bottom of each.
 */
export function HeaderCard({
  label,
  source,
  className = '',
  children,
}: {
  label: string
  /** Where the value comes from */
  source?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex h-full flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 ${className}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
      {source && (
        <div className="mt-auto pt-0.5">
          <SourceTag>{source}</SourceTag>
        </div>
      )}
    </div>
  )
}
