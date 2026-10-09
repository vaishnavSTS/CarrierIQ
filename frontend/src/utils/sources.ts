/**
 * Where each kind of record comes from, in words office staff recognise. Shown as "Source: …"
 * next to values, sections, timeline events and signals.
 */

export const SOURCES = {
  census: 'FMCSA Company Census (MCS-150)',
  authority: 'FMCSA operating authority (Motus, or the old L&I system)',
  insurance: 'FMCSA insurance filings (Motus, or the old L&I system)',
  insuranceHistory: 'FMCSA insurance history (Motus InsHist, L&I InsHist)',
  authorityHistory: 'FMCSA authority history (Motus AuthHist, L&I AuthHist)',
  renewal: 'Estimated from FMCSA insurance filing start dates',
  inspections: 'FMCSA Vehicle Inspection File',
  vins: 'FMCSA Inspections Per Unit (VINs); NHTSA vPIC decoding',
  team: 'Your team (entered in CarrierIQ)',
  checks: 'CarrierIQ checks of FMCSA records',
  registration:
    'FMCSA Company Census, Motus, Out of Service Orders, RevokeSuspend, BOC-3 and insurance filings',
  linked: 'FMCSA Company Census (searched across all carriers)',
  identityHistory: 'FMCSA Company Census changes; FMCSA authority history',
  signals: 'CarrierIQ rules over FMCSA and NHTSA records',
} as const

const SIGNAL_SOURCE: Record<string, string> = {
  AUTHORITY_CHANGE: SOURCES.authorityHistory,
  INSURANCE_CHANGE: SOURCES.insuranceHistory,
  IDENTITY_CHANGE: 'FMCSA Company Census (changes CarrierIQ has seen)',
  SAFETY_TREND: SOURCES.inspections,
  FLEET_CONSISTENCY: 'FMCSA Company Census (MCS-150) and inspections',
  SHARED_VIN: 'FMCSA Inspections Per Unit (VINs)',
  SHARED_CONTACT: SOURCES.linked,
  OWNERSHIP_EVENT: SOURCES.team,
}

/** The source of a signal, by its type. */
export function signalSource(signalType: string): string {
  return SIGNAL_SOURCE[signalType] ?? SOURCES.signals
}

/** The source of a timeline event, by its type's prefix (see backend change_detection). */
export function eventSource(eventType: string): string {
  if (eventType.startsWith('AUTHORITY_')) return SOURCES.authorityHistory
  if (eventType.startsWith('INSURANCE_')) return SOURCES.insuranceHistory
  if (eventType.startsWith('IDENTITY_')) return SOURCES.team
  return 'FMCSA records'
}
