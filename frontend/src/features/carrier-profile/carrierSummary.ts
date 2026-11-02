import type { CarrierProfile } from '../../types/carrierProfile'
import { formatPercent, humanize } from '../../utils/format'

const said = (status: string) => humanize(status).toLowerCase()

/**
 * The carrier in a sentence or two, built only from what the page itself shows. Try Now leaves out
 * the inspections, which belong to the Safety tab a visitor doesn't have.
 */
export function carrierSummary(
  profile: CarrierProfile,
  insuranceLabel: string | null,
  trying: boolean,
): string {
  const facts = [
    profile.registration_status
      ? `registration ${said(profile.registration_status)}`
      : 'registration status unknown',
    profile.authority.status
      ? `operating authority ${said(profile.authority.status)}`
      : 'no operating authority listed',
    insuranceLabel ? `insurance ${insuranceLabel.toLowerCase()}` : 'no insurance filing listed',
  ]
  const record = `FMCSA lists ${facts.join(', ')}.`
  if (trying) return record
  const recent = profile.safety.recent
  if (!recent || recent.inspections === 0) {
    return `${record} No roadside inspections in the last ${recent?.months ?? 24} months.`
  }
  const rates = [
    recent.vehicle_oos_rate !== null &&
      `vehicle out-of-service ${formatPercent(recent.vehicle_oos_rate)} (national ${formatPercent(recent.national_vehicle_oos_rate)})`,
    recent.driver_oos_rate !== null &&
      `driver out-of-service ${formatPercent(recent.driver_oos_rate)} (national ${formatPercent(recent.national_driver_oos_rate)})`,
  ].filter(Boolean)
  const inspections = `${recent.inspections} inspection${recent.inspections === 1 ? '' : 's'} in the last ${recent.months} months`
  return `${record} ${inspections}${rates.length ? `: ${rates.join(', ')}` : ''}.`
}
