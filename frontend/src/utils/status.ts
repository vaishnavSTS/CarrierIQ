export type Tone = 'ok' | 'warn' | 'down' | 'pending' | 'neutral'

/** Tone for an FMCSA status such as ACTIVE / INACTIVE / PENDING. */
export function statusTone(status: string | null): Tone {
  if (status === 'ACTIVE') return 'ok'
  if (status === 'PENDING') return 'warn'
  if (status === 'INACTIVE') return 'down'
  return 'neutral'
}

/** Tone for a timeline severity. */
export function severityTone(severity: string): Tone {
  if (severity === 'HIGH') return 'down'
  if (severity === 'MEDIUM') return 'warn'
  if (severity === 'LOW') return 'neutral'
  return 'pending'
}

/** Tone for the headline insurance status. */
export function insuranceTone(status: string | null): Tone {
  if (status === 'ON_FILE') return 'ok'
  if (status === 'NOT_ON_FILE') return 'down'
  return 'neutral'
}

export const INSURANCE_LABEL: Record<string, string> = {
  ON_FILE: 'On file',
  NOT_ON_FILE: 'Not on file',
}
