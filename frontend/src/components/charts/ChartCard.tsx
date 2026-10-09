import { useState, type ReactNode } from 'react'

/** A chart with a title, an optional note, and a "Show as table" switch (the table view keeps
 * every value reachable without hovering). */
export function ChartCard({
  title,
  subtitle,
  note,
  chart,
  table,
}: {
  title: string
  subtitle?: string
  note?: string
  chart: ReactNode
  table: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <div className="flex h-full flex-col rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {/* Grows to fill the card, so cards side by side end at the same line. */}
      <div className="flex flex-1 flex-col justify-center">
        {asTable ? <div className="max-h-72 overflow-auto">{table}</div> : chart}
      </div>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  )
}
