import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import { formatMonth } from '../../utils/format'
import type { Tone } from '../../utils/status'
import { HeaderCard } from './HeaderCard'
import { ISS_BAND } from './safety/issBand'

const RING_COLOR: Partial<Record<Tone, string>> = {
  ok: 'stroke-emerald-500',
  warn: 'stroke-amber-500',
  down: 'stroke-red-500',
}

/** The score as a ring filled to its share of 100, coloured by its band. */
function IssRing({ value, tone }: { value: number; tone: Tone }) {
  const r = 20
  const length = 2 * Math.PI * r
  return (
    <span className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-slate-200" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(Math.max(value, 0), 100) / 100)}
          className={RING_COLOR[tone] ?? 'stroke-slate-400'}
        />
      </svg>
      <span className="text-lg font-semibold tabular-nums text-slate-950">{value}</span>
    </span>
  )
}

/** The Estimated ISS in the profile header. Not on Try Now, which has no safety data. */
export function IssHeaderCard({ usdotNumber }: { usdotNumber: number }) {
  const { data, isPending } = useCarrierSafety(usdotNumber)
  const iss = data?.estimated_iss ?? null
  const band = iss?.band ? ISS_BAND[iss.band] : null
  return (
    <HeaderCard
      label="Estimated ISS"
      source={
        iss?.value != null
          ? `Carrier Safety Scan estimate from FMCSA data · ${formatMonth(iss.data_month)}. Not FMCSA’s official ISS`
          : undefined
      }
    >
      {isPending ? (
        <span className="text-slate-500">Loading…</span>
      ) : iss?.value != null && band ? (
        <>
          <IssRing value={iss.value} tone={band.tone} />
          <StatusBadge label={band.status} tone={band.tone} />
        </>
      ) : (
        <span className="text-slate-500">
          {iss ? 'Not enough inspection data' : 'Not available yet'}
        </span>
      )}
    </HeaderCard>
  )
}
