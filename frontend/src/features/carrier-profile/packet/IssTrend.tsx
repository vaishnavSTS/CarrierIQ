import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'

import type { EstimatedIss, IssHistoryEntry } from '../../../types/carrierSafety'

const month = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()
}

/**
 * The Estimated ISS this month against the previous month's (lower is better), for the report's
 * first page. The history saves a result only when it changes, so the previous result is the
 * newest one from an earlier FMCSA month; it is labelled with its own month.
 */
export function IssTrend({
  iss,
  history,
}: {
  iss: EstimatedIss | null
  history: IssHistoryEntry[]
}) {
  if (!iss) return null
  const previous = history.find((h) => h.data_month < iss.data_month) ?? null
  const now = iss.value
  const before = previous?.value ?? null
  const change = now !== null && before !== null ? now - before : null
  const lastLabel = previous
    ? monthsBetween(previous.data_month, iss.data_month) === 1
      ? `Last month · ${month(previous.data_month)}`
      : `Previous · ${month(previous.data_month)}`
    : 'Last month'

  const trend =
    change === null
      ? {
          tone: 'border-slate-300 bg-slate-50 text-slate-700',
          Icon: ArrowRight,
          text: 'No earlier score to compare',
        }
      : change < 0
        ? {
            tone: 'border-emerald-600 bg-emerald-50 text-emerald-700',
            Icon: ArrowDownRight,
            text: `Down ${-change} · better`,
          }
        : change > 0
          ? {
              tone: 'border-red-600 bg-red-50 text-red-700',
              Icon: ArrowUpRight,
              text: `Up ${change} · worse`,
            }
          : {
              tone: 'border-slate-300 bg-slate-50 text-slate-700',
              Icon: ArrowRight,
              text: 'No change',
            }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr_1.3fr] items-stretch gap-2">
      <div className="rounded-lg border border-slate-200 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {lastLabel}
        </div>
        <div className="text-2xl font-bold tabular-nums text-slate-700">{before ?? '—'}</div>
      </div>
      <ArrowRight className="size-5 self-center text-slate-400" aria-hidden />
      <div className="rounded-lg border border-slate-300 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          This month · {month(iss.data_month)}
        </div>
        <div className="text-2xl font-bold tabular-nums text-slate-900">{now ?? '—'}</div>
      </div>
      <div className={`flex items-center gap-2 rounded-lg border-l-4 px-3 py-2 ${trend.tone}`}>
        <trend.Icon className="size-7 shrink-0" aria-hidden />
        <div className="leading-tight">
          <div className="text-sm font-bold">{trend.text}</div>
          <div className="text-[10px] text-slate-600">Estimated ISS · lower is better</div>
        </div>
      </div>
    </div>
  )
}
