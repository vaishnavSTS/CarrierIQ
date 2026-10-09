import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierNetwork } from '../../../types/network'

export type FlagLevel = 'alert' | 'attention' | 'info'

/**
 * One item a broker's vetting may react to. Every title and explanation says which record it
 * comes from; CarrierIQ reports what the records show and never gives its own verdict.
 */
export interface BrokerFlag {
  key: string
  level: FlagLevel
  title: string
  /** What the record shows, and why a broker's vetting tool may react to it */
  why: string
  /** How such an item is usually resolved (a suggestion, not an instruction) */
  fix: string
}

const FIX: Record<string, string> = {
  motus:
    'Checking the carrier’s status in the FMCSA Portal and, if needed, claiming the USDOT number in Motus (Login.gov identity check).',
  mcs150: 'Filing an updated MCS-150 with the current fleet, drivers and contact details.',
  prior_revoke:
    'Documents that show how the companies are, or are not, related (formation papers, officers, ownership).',
  oos: 'Resolving the order with FMCSA; FMCSA has to rescind it.',
  revocations:
    'Confirming that insurance and the BOC-3 process agent filing are active; FMCSA reinstates authority only with both on file.',
  address: 'Correcting or confirming the address on an MCS-150.',
}

const RENEWAL_FIX =
  'A current certificate of insurance from the carrier or its insurer, showing the policy dates.'

const KIND_LABEL = { phone: 'phone', email: 'email', address: 'address', officer: 'officer' }

/** Turn public-record findings into the checklist a broker's vetting is likely to run. */
export function brokerFlags(network: CarrierNetwork, profile: CarrierProfile): BrokerFlag[] {
  const flags: BrokerFlag[] = []

  for (const check of network.registration_checks) {
    if (check.status !== 'alert' && check.status !== 'attention') continue
    flags.push({
      key: `check-${check.key}`,
      level: check.status,
      title: check.label,
      why: check.detail,
      fix:
        FIX[check.key] ??
        (check.key.startsWith('renewal_')
          ? RENEWAL_FIX
          : 'Reviewing the FMCSA record and correcting it if needed.'),
    })
  }

  const strong = network.linked_carriers.filter((c) => c.shares.some((s) => s.kind !== 'building'))
  if (strong.length > 0) {
    const kinds = new Set(
      strong.flatMap((c) => c.shares.map((s) => s.kind)).filter((k) => k !== 'building'),
    )
    const listed = [...kinds].map((k) => KIND_LABEL[k as keyof typeof KIND_LABEL]).join(', ')
    flags.push({
      key: 'shared-contact',
      level: strong.some((c) => c.status === 'INACTIVE') ? 'alert' : 'attention',
      title: `FMCSA's census lists the same ${listed} for ${strong.length} other carrier${strong.length === 1 ? '' : 's'}`,
      why: 'Some vetting tools link carriers that share contact details or people and ask about the relationship. Ordinary reasons include a family business, a shared office, or a dispatch or compliance service listing its own phone or email.',
      fix: 'Explaining each relationship (family business, previous company, dispatcher) and keeping the carrier’s own phone and email on its MCS-150.',
    })
  }

  const building = network.linked_carriers.filter((c) =>
    c.shares.every((s) => s.kind === 'building'),
  )
  if (building.length > 0) {
    flags.push({
      key: 'shared-building',
      level: 'info',
      title: `FMCSA's census lists ${building.length} other carrier${building.length === 1 ? '' : 's'} at the same street address (different units)`,
      why: 'Some vetting tools match on the street address alone and ask about carriers registered at the same building.',
      fix: 'Keeping the unit or suite number on the MCS-150.',
    })
  }

  const transfers = profile.timeline.filter((e) => e.event_type === 'AUTHORITY_TRANSFERRED')
  if (transfers.length > 0) {
    flags.push({
      key: 'transfer',
      level: 'attention',
      title: 'FMCSA’s authority history records a transfer',
      why: 'FMCSA’s authority history lists a transfer of this operating authority. Brokers often ask about authorities that changed hands.',
      fix: 'The documents for the transfer, showing it was part of a change of the same business.',
    })
  }

  const identityChanges = profile.recent_changes.filter((c) =>
    ['legal_name', 'dba_name', 'email'].includes(c.attribute),
  )
  if (identityChanges.length > 0) {
    flags.push({
      key: 'identity',
      level: 'info',
      title: 'FMCSA’s census shows a recent change of name or contact details',
      why: 'New names, emails or phones on an existing authority are a common check in broker vetting.',
      fix: 'Making sure brokers have the current details, with proof of the change.',
    })
  }

  if (network.ownership.state === 'CONFLICTING' || network.ownership.state === 'ATTESTED') {
    flags.push({
      key: 'ownership',
      level: network.ownership.state === 'ATTESTED' ? 'alert' : 'attention',
      title:
        network.ownership.state === 'ATTESTED'
          ? 'Ownership change attested (recorded by your team)'
          : 'Conflicting ownership attestation (recorded by your team)',
      why: network.ownership.summary,
      fix: network.ownership.action ?? '',
    })
  }

  const order: Record<FlagLevel, number> = { alert: 0, attention: 1, info: 2 }
  return flags.sort((a, b) => order[a.level] - order[b.level])
}
