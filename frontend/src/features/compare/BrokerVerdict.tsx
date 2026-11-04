import { Ban, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'

import { StatusBadge } from '../../components/StatusBadge'
import { formatDateTime } from '../../utils/format'
import { useComparison } from './useComparison'
import { VERDICT, vetCarrier } from './vetting'

const ROWS = [
  ['stops', Ban, 'text-red-700'],
  ['major', CircleAlert, 'text-red-700'],
  ['minor', TriangleAlert, 'text-amber-700'],
  ['strengths', CircleCheck, 'text-emerald-700'],
] as const

/** Top of a broker's carrier page: the same reading of the records as the Compare page. */
export function BrokerVerdict({ usdotNumber }: { usdotNumber: number }) {
  const [facts] = useComparison([usdotNumber])
  const vetting = facts ? vetCarrier(facts) : null
  if (!vetting) return null
  const { label, tone } = VERDICT[vetting.verdict]
  return (
    <section
      aria-label="Booking check"
      className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Booking check</h2>
        <StatusBadge label={label} tone={tone} />
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {ROWS.flatMap(([key, Icon, color]) =>
          vetting[key].map((item) => (
            <li key={`${key}-${item.key}`} className={`flex items-start gap-1.5 ${color}`}>
              <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{item.text}</span>
            </li>
          )),
        )}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Carrier Safety Scan’s reading of public FMCSA records, to help you vet. It isn’t a safety
        rating or a guarantee, and the booking decision is yours.
        {facts.profile?.last_refreshed_at &&
          ` FMCSA data refreshed ${formatDateTime(facts.profile.last_refreshed_at)}.`}
      </p>
    </section>
  )
}
