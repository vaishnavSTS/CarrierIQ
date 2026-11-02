import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import { formatMonth } from '../../utils/format'
import { HeaderCard } from './HeaderCard'
import { ISS_BAND } from './safety/issBand'

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
          ? `CarrierSafetyScan estimate from FMCSA data · ${formatMonth(iss.data_month)}. Not FMCSA’s official ISS`
          : undefined
      }
    >
      {isPending ? (
        <span className="text-slate-500">Loading…</span>
      ) : iss?.value != null && band ? (
        <>
          <span className="text-xl font-semibold tabular-nums text-slate-950">{iss.value}</span>
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
