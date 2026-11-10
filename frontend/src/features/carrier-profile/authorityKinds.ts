import type { AuthorityKind } from '../../types/carrierAuthority'

/** "Contract carrier" -> "Contract carrier authority"; Motus types read as FMCSA writes them. */
export function kindLabel(kind: string): string {
  return /^(common carrier|contract carrier|broker)$/i.test(kind) ? `${kind} authority` : kind
}

const LAPSED: Record<string, string> = { INACTIVE: 'inactive', WITHDRAWN: 'withdrawn' }

/** "A", "A and B", "A, B and C" */
function list(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * When one kind of authority under a docket is active and another inactive or withdrawn (e.g.
 * Motus' "Motor Carrier of Property" active, "Broker of Property" inactive), why FMCSA's
 * systems can seem to disagree about the docket. Null when there is nothing to explain: kinds
 * never held ("None") are normal and don't count.
 */
export function mixedAuthorityNote(docket: string, kinds: AuthorityKind[]): string | null {
  const active = kinds.filter((k) => k.status === 'ACTIVE').map((k) => kindLabel(k.kind))
  const lapsed = kinds.filter((k) => LAPSED[k.status ?? ''])
  if (active.length === 0 || lapsed.length === 0) return null
  const lapsedText = list(lapsed.map((k) => `${kindLabel(k.kind)} is ${LAPSED[k.status ?? '']}`))
  const oneLapsed = lapsed.length === 1 ? kindLabel(lapsed[0].kind) : 'the inactive kinds'
  return (
    `FMCSA lists each kind of authority under ${docket} separately: ${list(active)} ` +
    `${active.length === 1 ? 'is' : 'are'} active; ${lapsedText}. ` +
    `The docket counts as active because at least one kind is, which is what FMCSA’s SAFER ` +
    `snapshot shows. A check that looks only at ${oneLapsed} would see it as inactive.`
  )
}
