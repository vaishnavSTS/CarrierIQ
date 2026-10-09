import type { ReactNode } from 'react'

/** Floating readout. Values lead (strong), labels follow (secondary). Text, never innerHTML. */
export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs shadow-md"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  )
}

export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 font-medium text-slate-500">{children}</div>
}

export function TooltipRow({
  value,
  label,
  color,
}: {
  value: string
  label: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {color && <span className="h-0.5 w-3 rounded" style={{ backgroundColor: color }} />}
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
      <span className="text-slate-500">{label}</span>
    </div>
  )
}
