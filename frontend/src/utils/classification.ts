/** FMCSA census CLASSDEF ("PRIVATE PROPERTY;AUTHORIZED FOR HIRE") helpers. */

const LABELS: Record<string, string> = {
  'AUTHORIZED FOR HIRE': 'Authorized for hire',
  'EXEMPT FOR HIRE': 'Exempt for hire',
  'PRIVATE PROPERTY': 'Private (hauls its own goods)',
  'PRIVATE PASSENGER, BUSINESS': 'Private passenger (business)',
  'PRIVATE PASSENGER, NON-BUSINESS': 'Private passenger (non-business)',
}

export function classifications(value: string | null): string[] {
  return value ? value.split(';').filter(Boolean) : []
}

export function classificationLabel(part: string): string {
  if (LABELS[part]) return LABELS[part]
  const text = part.toLowerCase().replace(/-/g, ' – ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Only "AUTHORIZED FOR HIRE" needs for-hire operating authority and FMCSA insurance filings.
 * null when the classification is unknown. */
export function needsForHireAuthority(value: string | null): boolean | null {
  const parts = classifications(value)
  if (parts.length === 0) return null
  return parts.includes('AUTHORIZED FOR HIRE')
}
