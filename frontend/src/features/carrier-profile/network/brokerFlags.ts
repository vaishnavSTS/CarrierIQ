import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierNetwork } from '../../../types/network'

export type FlagLevel = 'alert' | 'attention' | 'info'

export interface BrokerFlag {
  key: string
  level: FlagLevel
  title: string
  /** Why a broker's vetting tool may react to it */
  why: string
  /** What usually clears it */
  fix: string
}

const FIX: Record<string, string> = {
  motus:
    'Claim the USDOT number in Motus through the FMCSA Portal (Login.gov identity check), so current FMCSA data shows the authority and insurance.',
  mcs150: 'File an updated MCS-150 with current fleet, drivers and contact details.',
  prior_revoke:
    'Have documents ready showing how the companies are, or are not, related (formation papers, officers, ownership).',
  oos: 'Resolve the order with FMCSA; brokers cannot use the carrier while it is active.',
  revocations:
    'Make sure insurance and the BOC-3 process agent filing are active; reinstatement needs both.',
  address: 'Update the address on the MCS-150 so FMCSA mail reaches the carrier.',
}

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
      fix: FIX[check.key] ?? 'Review the FMCSA record and correct it if needed.',
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
      title: `Shares ${listed} with ${strong.length} other carrier${strong.length === 1 ? '' : 's'}`,
      why: 'Vetting tools link carriers that share contact details or people, a common sign of related or reincarnated companies. A dispatch or compliance service listing its own phone or email can also cause it.',
      fix: 'Be ready to explain each relationship (family business, previous company, dispatcher), and keep the carrier’s own phone and email on its MCS-150.',
    })
  }

  const building = network.linked_carriers.filter((c) =>
    c.shares.every((s) => s.kind === 'building'),
  )
  if (building.length > 0) {
    flags.push({
      key: 'shared-building',
      level: 'info',
      title: `Address shared with ${building.length} other carrier${building.length === 1 ? '' : 's'} (different units)`,
      why: 'Some vetting tools match on the street address alone and flag carriers registered at the same building.',
      fix: 'Keep the unit or suite number on the MCS-150, and expect occasional questions about the shared building.',
    })
  }

  const transfers = profile.timeline.filter((e) => e.event_type === 'AUTHORITY_TRANSFERRED')
  if (transfers.length > 0) {
    flags.push({
      key: 'transfer',
      level: 'attention',
      title: 'Operating authority transferred',
      why: 'FMCSA records show an authority transfer. Brokers watch for authorities that change hands, since sold MC numbers are used in freight fraud.',
      fix: 'Keep the documents for the transfer ready (it must be part of a legitimate change of the same business).',
    })
  }

  const identityChanges = profile.recent_changes.filter((c) =>
    ['legal_name', 'dba_name', 'email'].includes(c.attribute),
  )
  if (identityChanges.length > 0) {
    flags.push({
      key: 'identity',
      level: 'info',
      title: 'Recent changes to name or contact details',
      why: 'New names, emails or phones on an existing authority are a common check in broker vetting.',
      fix: 'Make sure brokers have the current details, and keep proof of the change.',
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
