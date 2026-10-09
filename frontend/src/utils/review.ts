import type { Tone } from './status'

/** "3 open signals" / "No open signals"; null when signals haven't been computed. */
export function reviewLabel(status: string | null, count: number): string | null {
  if (status === null) return null
  if (status === 'NO_OPEN_SIGNALS') return 'No open signals'
  return `${count} open signal${count === 1 ? '' : 's'}`
}

/** Tone of the highest open severity: HIGH red, MEDIUM amber, LOW neutral. */
export function severityTone(severity: string | null): Tone {
  if (severity === 'HIGH') return 'down'
  if (severity === 'MEDIUM') return 'warn'
  return 'pending'
}
