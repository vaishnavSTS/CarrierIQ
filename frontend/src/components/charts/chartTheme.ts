/**
 * Chart colours for the dark purple surface (#161126). The two series are the dark-mode steps
 * of slots 1–2 of the reference data-viz palette, re-validated on this surface: lightness band,
 * chroma, colour-blind separation (worst ΔE 26.8) and 3:1 contrast all pass.
 * Text never uses series colours; it uses the ink tokens below.
 */
export const SERIES = {
  blue: '#3987e5',
  orange: '#d95926',
} as const

export const INK = {
  primary: '#f2effa',
  secondary: '#b3aacd',
  muted: '#8a80a8',
} as const

export const CHROME = {
  surface: '#161126',
  grid: '#2e2447',
  baseline: '#40355f',
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
