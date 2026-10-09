import type { CarrierAuthority } from '../../../types/carrierAuthority'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierNetwork } from '../../../types/network'
import { formatDate, formatMoney, formatPercent, humanize } from '../../../utils/format'
import type { BrokerFlag } from '../network/brokerFlags'

export interface PacketItem {
  key: string
  title: string
  detail: string | null
}

/** The first sentence of a check's explanation; the full text is on the Network tab. */
export function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}

/**
 * The packet's two lists, from the same checks as the other tabs: what a broker's check may
 * flag, and what FMCSA's records show in order. Every item names its record; none is a verdict.
 */
export function packetItems(
  profile: CarrierProfile,
  authority: CarrierAuthority,
  network: CarrierNetwork,
  flags: BrokerFlag[],
): { watch: PacketItem[]; good: PacketItem[] } {
  const watch: PacketItem[] = flags
    .filter((f) => f.level === 'alert' || f.level === 'attention')
    .map((f) => ({ key: f.key, title: f.title, detail: firstSentence(f.why) }))
  const good: PacketItem[] = []
  let safetyAt = 0

  const recent = profile.safety.recent
  if (recent) {
    for (const [unit, rate, national, oos, base] of [
      [
        'vehicle',
        recent.vehicle_oos_rate,
        recent.national_vehicle_oos_rate,
        recent.vehicle_oos,
        recent.vehicle_inspections,
      ],
      [
        'driver',
        recent.driver_oos_rate,
        recent.national_driver_oos_rate,
        recent.driver_oos,
        recent.driver_inspections,
      ],
    ] as const) {
      if (rate === null) continue
      const figures = `${oos} of ${base} inspections that examined the ${unit} (${formatPercent(rate)}) in the last ${recent.months} months; FMCSA’s national average is ${formatPercent(national)}.`
      const item = {
        key: `${unit}-oos`,
        title:
          rate > national
            ? `${humanize(unit)} out-of-service rate above the national average`
            : `${humanize(unit)} out-of-service rate at or below the national average`,
        detail: base < 5 ? `${figures} Based on few inspections.` : figures,
      }
      // Safety first in the attention list: it is what a broker looks at first.
      if (rate > national) watch.splice(safetyAt++, 0, item)
      else good.push(item)
    }
  }

  for (const d of authority.dockets) {
    if (d.status === 'ACTIVE') {
      good.push({
        key: `authority-${d.prefix}${d.number}`,
        title: `Operating authority active (${d.prefix}${d.number})`,
        detail: `FMCSA lists ${d.authority_type ?? 'the authority'} as active.`,
      })
    }
  }
  if (profile.insurance.status === 'ON_FILE') {
    const d = authority.dockets.find((x) => x.bipd_on_file)
    good.push({
      key: 'insurance',
      title: 'Liability insurance on file',
      detail: d
        ? `FMCSA lists ${formatMoney(d.bipd_on_file)} BI&PD on file (${formatMoney(d.bipd_required)} required).`
        : 'FMCSA lists BI&PD insurance on file.',
    })
  }
  for (const check of network.registration_checks) {
    if (check.status === 'ok') {
      good.push({
        key: `check-${check.key}`,
        title: check.label,
        detail: firstSentence(check.detail),
      })
    }
  }
  if (profile.safety.safety_rating === 'SATISFACTORY') {
    good.push({
      key: 'rating',
      title: 'Satisfactory safety rating',
      detail: `FMCSA rated the carrier Satisfactory${
        profile.safety.safety_rating_date
          ? ` on ${formatDate(profile.safety.safety_rating_date)}`
          : ''
      }.`,
    })
  }
  if (profile.first_registered_date) {
    const years = Math.floor(
      (Date.now() - new Date(profile.first_registered_date).getTime()) / (365.25 * 86400000),
    )
    if (years >= 2) {
      good.push({
        key: 'established',
        title: `Registered ${years} years`,
        detail: `FMCSA’s census lists the USDOT number as added on ${formatDate(profile.first_registered_date)}.`,
      })
    }
  }
  return { watch, good }
}
