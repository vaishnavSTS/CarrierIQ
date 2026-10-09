/** Display names for signal types, rules and evidence sources. */

export const TYPE_ORDER = [
  'AUTHORITY_CHANGE',
  'INSURANCE_CHANGE',
  'IDENTITY_CHANGE',
  'SAFETY_TREND',
  'FLEET_CONSISTENCY',
  'SHARED_VIN',
] as const

export const TYPE_LABEL: Record<string, string> = {
  AUTHORITY_CHANGE: 'Authority changes',
  INSURANCE_CHANGE: 'Insurance changes',
  IDENTITY_CHANGE: 'Identity changes',
  SAFETY_TREND: 'Safety trend',
  FLEET_CONSISTENCY: 'Fleet consistency',
  SHARED_VIN: 'Shared equipment',
  SHARED_CONTACT: 'Shared contact details',
  OWNERSHIP_EVENT: 'Ownership events',
}

/** What each rule checks, in one sentence: "how was this calculated?" (spec 13). */
export const RULE_EXPLAINED: Record<string, string> = {
  authority_change:
    'Operating-authority actions in FMCSA records from the last two years, and pending revocations.',
  insurance_change:
    'Insurer, coverage, cancellation and gap changes in FMCSA insurance filings from the last two years.',
  identity_change:
    'Name, address, phone, email, officer and web-domain changes in the FMCSA census record from the last two years.',
  safety_trend:
    'Out-of-service rates over the last 12 months compared with the 12 months before. The carrier is compared only with itself.',
  fleet_consistency:
    'Registered power units compared with power units seen on inspections in the last 24 months.',
  shared_vin:
    'VINs on this carrier’s inspections that were also recorded on inspections of another USDOT number.',
  shared_contact:
    'Phone, email, street address and unit, or officer names in this carrier’s FMCSA census record that also appear on another USDOT number.',
  ownership_event:
    'Ownership and identity events recorded by your team, such as a broker attestation of an ownership change.',
}

export const CONFIDENCE_EXPLAINED: Record<string, string> = {
  HIGH: 'Directly supported by multiple consistent records, or one authoritative record of the exact fact.',
  MEDIUM: 'Supported by a single observation, or by records that could have a benign explanation.',
  LOW: 'Indirect or partial evidence; context only.',
}

export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  RECORD: 'Record',
  COMPARISON: 'Comparison',
  THRESHOLD: 'Rule threshold',
}

export function sourceName(source: string | null): string | null {
  if (!source) return null
  return (
    {
      dot_socrata: 'FMCSA via data.transportation.gov',
      MOTUS: 'FMCSA Motus',
      LEGACY_LI: 'FMCSA L&I (no longer updated)',
      CENSUS: 'FMCSA census',
      nhtsa_vpic: 'NHTSA vPIC',
    }[source] ?? source
  )
}
