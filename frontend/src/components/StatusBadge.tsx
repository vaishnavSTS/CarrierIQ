import type { Tone } from '../utils/status'

const TONE_STYLES: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  down: 'bg-red-50 text-red-700 ring-red-600/20',
  pending: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  neutral: 'bg-surface text-slate-500 ring-slate-300',
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  )
}
