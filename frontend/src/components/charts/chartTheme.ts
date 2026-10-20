/**
 * Chart colours, as the design tokens in index.css so charts follow the theme (and print).
 * The two series are the dark-mode steps of slots 1–2 of the reference data-viz palette,
 * validated on the dark surface (#1a1828): colour-blind separation (worst ΔE 26.8) and 3:1
 * contrast (4.8:1 and 4.5:1) pass. Text never uses series colours; it uses the ink tokens below.
 */
export const SERIES = {
  blue: 'var(--color-chart-1)',
  orange: 'var(--color-chart-2)',
} as const

export const INK = {
  primary: 'var(--color-slate-900)',
  secondary: 'var(--color-slate-600)',
  muted: 'var(--color-slate-400)',
} as const

export const CHROME = {
  surface: 'var(--color-surface)',
  grid: 'var(--color-slate-200)',
  baseline: 'var(--color-slate-300)',
} as const

/** A "nice" upper bound for an axis (1, 2, 2.5, 5, 10 × 10^n) and its tick step. */
export function niceScale(max: number, targetTicks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 1 / targetTicks }
  const rough = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough
  return { max: Math.ceil(max / step) * step, step }
}

export function ticks(max: number, step: number): number[] {
  const values: number[] = []
  for (let v = 0; v <= max + step / 1000; v += step) values.push(Number(v.toFixed(10)))
  return values
}
