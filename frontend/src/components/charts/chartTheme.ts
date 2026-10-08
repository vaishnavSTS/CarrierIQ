/**
 * Chart colours (light surface). Categorical slots 1–2 of the reference data-viz palette,
 * validated together for colour-blind separation and 3:1 contrast on white and #fcfcfb.
 * Text never uses series colours; it uses the ink tokens below.
 */
export const SERIES = {
  blue: '#2a78d6',
  orange: '#eb6834',
} as const

export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
} as const

export const CHROME = {
  surface: '#ffffff',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
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
