export type Tone = 'ok' | 'warn' | 'down' | 'pending' | 'neutral'

/** Tone for an FMCSA status such as ACTIVE / INACTIVE / PENDING. */
export function statusTone(status: string | null): Tone {
  if (status === 'ACTIVE') return 'ok'
  if (status === 'PENDING') return 'warn'
  if (status === 'INACTIVE') return 'down'
  return 'neutral'
}
