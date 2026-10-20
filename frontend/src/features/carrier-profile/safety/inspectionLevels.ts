/** FMCSA's North American Standard inspection levels, by number. */
const LEVELS: Record<number, [roman: string, name: string]> = {
  1: ['I', 'Full'],
  2: ['II', 'Walk-around'],
  3: ['III', 'Driver-only'],
  4: ['IV', 'Special study'],
  5: ['V', 'Vehicle-only'],
  6: ['VI', 'Radioactive materials'],
  7: ['VII', 'Jurisdiction-mandated'],
  8: ['VIII', 'Electronic'],
}

/** 1 -> "Level I – Full"; an unknown or missing level is said so. */
export function levelLabel(level: number | string | null): string {
  const n = typeof level === 'string' ? Number(level) : level
  if (n === null || !Number.isInteger(n)) return 'Level not recorded'
  const known = LEVELS[n]
  return known ? `Level ${known[0]} – ${known[1]}` : `Level ${n}`
}
