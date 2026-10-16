import { createContext, useContext } from 'react'

/** At most this many carriers side by side: wider stops fitting on a laptop screen. */
export const MAX_COMPARE = 3

export interface CompareList {
  /** The Compare page in this portal: /compare (STS staff) or /broker/compare */
  page: string
  usdots: number[]
  has: (usdot: number) => boolean
  full: boolean
  toggle: (usdot: number) => void
  remove: (usdot: number) => void
  replace: (usdots: number[]) => void
  clear: () => void
}

/** The compare selection; null in the client portal (no compare there). */
export const CompareContext = createContext<CompareList | null>(null)

export function useCompareList(): CompareList | null {
  return useContext(CompareContext)
}

/** "123,456" -> [123, 456]: valid, distinct USDOT numbers, at most MAX_COMPARE. */
export function parseUsdots(value: string | null): number[] {
  const numbers = (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(numbers)].slice(0, MAX_COMPARE)
}

export function comparePath(page: string, usdots: number[]): string {
  return usdots.length ? `${page}?usdot=${usdots.join(',')}` : page
}
