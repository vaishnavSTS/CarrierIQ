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
      className={`flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-gradient-to-b from-surface to-slate-50/70 px-4 py-3 transition-shadow hover:shadow-md ${className}`}
    >
      <div className="font-label text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
      {source && (
        <div className="mt-auto pt-0.5">
          <SourceTag>{source}</SourceTag>
        </div>
      )}
    </div>
  )
}
