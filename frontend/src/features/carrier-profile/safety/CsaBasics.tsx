import { StatusBadge } from '../../../components/StatusBadge'
import type { Sms } from '../../../types/carrierSafety'
import { Empty } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

function YesNo({ value, yes }: { value: boolean | null; yes: string }) {
  if (value === null) return <span className="text-slate-500">—</span>
  return value ? <StatusBadge label={yes} tone="warn" /> : <span>No</span>
}

/**
 * FMCSA's SMS (CSA) results for the carrier, exactly as FMCSA publishes them. Percentiles and
 * alerts appear only where FMCSA publishes them (passenger carriers); CarrierIQ estimates none.
 */
export function CsaBasics({ sms }: { sms: Sms | null }) {
  if (sms === null) {
    return <Empty>FMCSA’s SMS results have not been fetched yet; use Refresh now.</Empty>
  }
  if (sms.dataset === null) {
    return (
      <Empty>
        This carrier is not in FMCSA’s SMS results. FMCSA lists active carriers only, and only those
        with inspections or crashes in the 24-month measurement period.
      </Empty>
    )
  }
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        FMCSA {sms.dataset} · 24-month measurement period · {sms.inspections} inspections (
        {sms.driver_inspections} driver, {sms.vehicle_inspections} vehicle). A higher measure means
        more, or more severe, violations relative to the carrier’s exposure.
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={cellClass}>BASIC</th>
              <th className={`${cellClass} text-right`}>Inspections with a violation</th>
              <th className={`${cellClass} text-right`}>Measure</th>
              <th className={`${cellClass} text-right`}>Percentile</th>
              {sms.passenger && <th className={cellClass}>FMCSA alert</th>}
              <th className={cellClass}>Acute / critical</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {sms.basics.map((b) => (
              <tr key={b.key}>
                <td className={cellClass}>{b.label}</td>
                <td className={`${cellClass} text-right`}>{b.inspections_with_violation}</td>
                <td className={`${cellClass} text-right`}>{b.measure ?? '—'}</td>
                <td className={`${cellClass} text-right`}>
                  {b.percentile !== null ? (
                    `${b.percentile}%`
                  ) : (
                    <span className="text-xs text-slate-500">{b.note ?? '—'}</span>
                  )}
                </td>
                {sms.passenger && (
                  <td className={cellClass}>
                    <YesNo value={b.alert} yes="alert" />
                  </td>
                )}
                <td className={cellClass}>
                  <YesNo value={b.acute_critical} yes="yes" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {sms.passenger
          ? 'Percentiles rank the carrier against similar carriers (higher is worse); an alert means FMCSA’s percentile is over its intervention threshold or a serious violation was found in the last 12 months.'
          : 'FMCSA does not publish percentiles or alerts for property carriers (FAST Act, 2015), only the measures. Acute / critical: an acute or critical violation found in an FMCSA investigation in the last 12 months.'}{' '}
        Crash Indicator and Hazardous Materials BASICs are not in FMCSA’s public files.
      </p>
    </div>
  )
}
