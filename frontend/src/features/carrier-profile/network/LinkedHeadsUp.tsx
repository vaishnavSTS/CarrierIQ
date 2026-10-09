import { Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useCarrierNetwork } from '../../../hooks/useNetwork'
import type { LinkedCarrier } from '../../../types/network'

const KIND_LABEL: Record<string, string> = {
  phone: 'phone',
  email: 'email',
  address: 'address',
  officer: 'officer',
}
const NAMED = 2

function shared(carriers: LinkedCarrier[]): string {
  const kinds = [
    ...new Set(carriers.flatMap((c) => c.shares.map((s) => s.kind)).filter((k) => k in KIND_LABEL)),
  ].map((k) => KIND_LABEL[k])
  return kinds.length <= 2
    ? kinds.join(' & ')
    : `${kinds.slice(0, -1).join(', ')} & ${kinds[kinds.length - 1]}`
}

/**
 * Header heads-up: other carriers that FMCSA's census lists with the same phone, email,
 * address or officer. Same-building links (a different unit) are left to the Network tab.
 */
export function LinkedHeadsUp({ usdotNumber }: { usdotNumber: number }) {
  const { data } = useCarrierNetwork(usdotNumber)
  const linked = (data?.linked_carriers ?? []).filter((c) =>
    c.shares.some((s) => s.kind !== 'building'),
  )
  if (linked.length === 0) return null

  const inactive = linked.some((c) => c.status === 'INACTIVE')
  const names = linked.slice(0, NAMED)
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Linked carriers:</span>
      <Link
        to="?tab=network"
        replace
        title="From FMCSA's census. A relationship to review, not a finding."
        className={`flex flex-wrap items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset hover:underline ${
          inactive
            ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
            : 'bg-accent/10 text-slate-800 ring-accent/30'
        }`}
      >
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        <span>
          Shares {shared(linked)} with{' '}
          {names.map((c, i) => (
            <span key={c.usdot_number}>
              {i > 0 && ', '}
              <span className="font-medium">
                {c.legal_name ?? 'a carrier not in the census'}
              </span>{' '}
              <span className="font-mono text-slate-500">
                (USDOT {c.usdot_number}
                {c.status === 'INACTIVE' && ', not active'})
              </span>
            </span>
          ))}
          {linked.length > NAMED && ` and ${linked.length - NAMED} more`}
        </span>
        <span className="text-slate-500">→ Network tab</span>
      </Link>
    </div>
  )
}
