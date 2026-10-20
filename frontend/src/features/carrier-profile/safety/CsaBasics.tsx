import { NotLoaded } from '../../../components/NotLoaded'
import { StatusBadge } from '../../../components/StatusBadge'
import type { Basic, Sms } from '../../../types/carrierSafety'
import { ordinal } from '../../../utils/format'
import { Empty } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

function YesNo({ value, yes }: { value: boolean | null; yes: string }) {
  if (value === null) return <span className="text-slate-500">—</span>
  return value ? <StatusBadge label={yes} tone="warn" /> : <span>No</span>
}

/** FMCSA's words for a percentile it does not give: no violations, or too little data. */
function percentileText(b: Basic, passenger: boolean): string {
  if (b.percentile !== null) return `${ordinal(b.percentile)}`
  if (b.inspections_with_violation === 0) return 'No violations'
  if (!passenger) return 'Not public (property carrier)'
  return b.note ?? 'Insufficient data'
}

/**
 * FMCSA's SMS (CSA) results for the carrier, exactly as FMCSA publishes them. Percentiles and
 * alerts appear only where FMCSA publishes them (passenger carriers); CarrierSafetyScan's own estimate
 * is the Estimated ISS card above, labelled as such.
 */
export function CsaBasics({ sms }: { sms: Sms | null }) {
  if (sms === null) {
    return <NotLoaded what="FMCSA’s SMS (CSA) results" />
  }
  if (sms.dataset === null) {
    return (
      <Empty>
        Not in FMCSA’s SMS results. FMCSA lists only active carriers with an inspection or crash in
        the last 24 months.
      </Empty>
    )
  }
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        FMCSA SMS {sms.dataset} · last 24 months · {sms.inspections} inspections (
        {sms.driver_inspections} that examined the driver, {sms.vehicle_inspections} that examined
        the vehicle). Measure: FMCSA’s weighted violation score for the category, scaled to the
        carrier’s inspections or size; it has no fixed range, and higher means more or more serious
        violations.
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={cellClass}>Category</th>
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
                <td className={`${cellClass} text-right`}>
                  {b.measure !== null
                    ? b.measure.toFixed(2)
                    : b.inspections_with_violation === 0
                      ? 'No violations'
                      : '—'}
                </td>
                <td className={`${cellClass} text-right`}>
                  {b.percentile !== null ? (
                    percentileText(b, sms.passenger)
                  ) : (
                    <span className="text-xs text-slate-500">
                      {percentileText(b, sms.passenger)}
                    </span>
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
          ? 'Percentile: rank against similar carriers (higher is worse). Alert: over FMCSA’s intervention threshold, or a serious violation in the last 12 months.'
          : 'For property carriers FMCSA publishes only the measures, not percentiles or alerts (FAST Act, 2015).'}{' '}
        Acute / critical: a serious violation found in an FMCSA investigation (not a roadside
        inspection) in the last 12 months. FMCSA does not publish the Crash Indicator or Hazardous
        Materials measures; the Estimated ISS above calculates the Crash Indicator itself.
      </p>
    </div>
  )
}
