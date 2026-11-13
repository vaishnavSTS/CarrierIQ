import type { Operation } from '../types/carrierProfile'

/** "Interstate" / "Intrastate only" from the census CARRIER_OPERATION; null when unknown. */
export function operatingArea(op: Operation | null | undefined): string | null {
  if (!op?.operation) return null
  return op.operation === 'INTERSTATE' ? 'Interstate' : 'Intrastate only'
}

/** "Hazmat" / "No hazmat"; null when unknown. */
export function hazmatLabel(op: Operation | null | undefined): string | null {
  if (op?.hazmat == null) return null
  return op.hazmat ? 'Hazmat' : 'No hazmat'
}

/** "Interstate · Hazmat", or whichever half is known; null when neither is. */
export function operationSummary(op: Operation | null | undefined): string | null {
  return [operatingArea(op), hazmatLabel(op)].filter(Boolean).join(' · ') || null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 interstate · 0 intrastate · 2 with a CDL"; null when no count is known. */
export function driverSplit(op: Operation | null | undefined): string | null {
  if (!op) return null
  const parts = [
    op.interstate_drivers != null && `${op.interstate_drivers} interstate`,
    op.intrastate_drivers != null && `${op.intrastate_drivers} intrastate`,
    op.cdl_drivers != null && `${plural(op.cdl_drivers, 'driver')} with a CDL`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** "2 beyond 100 miles, 1 within" for one operating area; null when both are 0 or unknown. */
export function rangeSplit(beyond: number | null, within: number | null): string | null {
  const parts = [
    beyond ? `${beyond} beyond 100 miles` : null,
    within ? `${within} within 100 miles` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}
