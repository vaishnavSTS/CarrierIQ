import {
  CircleCheck,
  CircleMinus,
  Mail,
  OctagonX,
  Phone,
  Printer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useCarrierAuthority } from '../../../hooks/useCarrierAuthority'
import { useCarrierEquipment } from '../../../hooks/useCarrierEquipment'
import { useCarrierSafety } from '../../../hooks/useCarrierSafety'
import { useCarrierNetwork } from '../../../hooks/useNetwork'
import { usePortalMode } from '../../../hooks/usePortalMode'
import type { Portal } from '../../../types/auth'
import type { CarrierAuthority } from '../../../types/carrierAuthority'
import type { CarrierEquipment } from '../../../types/carrierEquipment'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierSafety } from '../../../types/carrierSafety'
import type { CarrierNetwork } from '../../../types/network'
import { classificationLabel, classifications } from '../../../utils/classification'
import {
  formatDate,
  formatLocalDate,
  formatMoney,
  formatPercent,
  formatPhone,
  humanize,
} from '../../../utils/format'
import { brokerFlags } from '../network/brokerFlags'
import { groupTip, improvementSummary } from '../safety/improvementTips'
import { IssGauge } from '../safety/IssGauge'
import { IssTrend } from './IssTrend'
import { basicTiles, type BasicTile, type TileTone } from './basicTiles'
import { STS_CONTACT } from './contact'
import { packetItems, type PacketItem } from './packetItems'
import { RecordPage } from './RecordPage'
import { tileFacts } from './recordDetail'

/** Caps that keep each printed page to one A4 page. */
const MAX_HURTING = 4
const MAX_WATCH = 3
const MAX_GOOD = 8
const MAX_DRIVER_ROWS = 4
const MAX_EVENTS = 5
const MAX_LINKED = 4

const TONE: Record<TileTone, { box: string; icon: string; title: string; Icon: LucideIcon }> = {
  red: {
    box: 'border-red-600 bg-red-50',
    icon: 'text-red-600',
    title: 'text-red-700',
    Icon: OctagonX,
  },
  amber: {
    box: 'border-amber-600 bg-amber-50',
    icon: 'text-amber-600',
    title: 'text-amber-700',
    Icon: TriangleAlert,
  },
  green: {
    box: 'border-emerald-600 bg-emerald-50',
    icon: 'text-emerald-600',
    title: 'text-emerald-700',
    Icon: CircleCheck,
  },
  grey: {
    box: 'border-slate-300 bg-slate-50',
    icon: 'text-slate-500',
    title: 'text-slate-700',
    Icon: CircleMinus,
  },
}

function yearsSince(value: string | null): number | null {
  if (!value) return null
  return Math.floor((Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600 * 1000))
}

/** One printed page: a running header, then the page's content. */
function Sheet({
  page,
  total,
  title,
  carrier,
  children,
}: {
  page: number
  total: number
  title: string
  carrier: string
  children: ReactNode
}) {
  return (
    <section className="packet-sheet space-y-5 rounded-xl border border-slate-200 bg-surface p-6 sm:p-8 print:space-y-4 print:rounded-none print:border-0 print:p-0">
      <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
        <span className="shrink-0 whitespace-nowrap">
          <span className="font-semibold text-slate-900">CarrierSafetyScan</span> · {title}
        </span>
        <span className="flex min-w-0 gap-1 normal-case tracking-normal">
          <span className="truncate">{carrier}</span>
          <span className="shrink-0 whitespace-nowrap">
            · Page {page} of {total}
          </span>
        </span>
      </div>
      {children}
    </section>
  )
}

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 text-base font-semibold tracking-tight text-slate-900">
      {children}
      {aside && <span className="text-xs font-normal text-slate-500">{aside}</span>}
    </h2>
  )
}

function CountPill({ tone, count, label }: { tone: TileTone; count: number; label: string }) {
  const { box, icon, title, Icon } = TONE[tone]
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border-l-4 px-3 py-2 ${box}`}>
      <Icon className={`size-5 shrink-0 ${icon}`} aria-hidden />
      <span className={`text-2xl font-bold tabular-nums leading-none ${title}`}>{count}</span>
      <span className="text-xs font-medium leading-tight text-slate-700">{label}</span>
    </div>
  )
}

function Tile({ tile, facts }: { tile: BasicTile; facts: string[] }) {
  const { box, icon, title, Icon } = TONE[tile.tone]
  return (
    <div className={`break-inside-avoid rounded-lg border-l-4 px-3 py-2.5 ${box}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`size-4 shrink-0 ${icon}`} aria-hidden />
        <span className="text-sm font-semibold text-slate-900">{tile.label}</span>
      </div>
      <div className={`mt-1 text-sm font-semibold ${title}`}>{tile.status}</div>
      {tile.note && (
        <div className="mt-0.5 text-[11px] leading-snug text-slate-600">{tile.note}</div>
      )}
      {facts.length > 0 && (
        <ul className="mt-1 space-y-px border-t border-black/5 pt-1 text-[10.5px] leading-snug text-slate-600">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemBox({ tone, item }: { tone: TileTone; item: PacketItem }) {
  const { box, icon, title, Icon } = TONE[tone]
  return (
    <li className={`break-inside-avoid rounded-lg border-l-4 px-3 py-2 ${box}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} aria-hidden />
        <div className="min-w-0 text-sm">
          <div className={`font-semibold ${title}`}>{item.title}</div>
          {item.detail && <p className="mt-0.5 text-slate-700">{item.detail}</p>}
          {item.fix && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">What usually fixes it:</span>{' '}
              {item.fix}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function More({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <p className="text-xs text-slate-500">
      +{count} more on the carrier’s page in CarrierSafetyScan.
    </p>
  )
}

/** A carrier's out-of-service rate against FMCSA's national average, on a 0–50% scale. */
function OosBar({
  label,
  rate,
  national,
  oos,
  base,
}: {
  label: string
  rate: number | null
  national: number
  oos: number
  base: number
}) {
  const scale = (v: number) => `${Math.min(v / 0.5, 1) * 100}%`
  const above = rate !== null && rate > national
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-900">{label}</span>
        <span className="tabular-nums">
          <span className={`font-bold ${above ? 'text-red-700' : 'text-emerald-700'}`}>
            {formatPercent(rate)}
          </span>{' '}
          <span className="text-xs text-slate-500">national {formatPercent(national)}</span>
        </span>
      </div>
      <div className="relative mt-1 h-2.5 rounded-full bg-slate-100">
        {rate !== null && (
          <div
            className={`h-2.5 rounded-full ${above ? 'bg-red-600' : 'bg-emerald-600'}`}
            style={{ width: scale(rate) }}
          />
        )}
        <div
          className="absolute -top-1 h-4.5 w-0.5 bg-slate-900"
          style={{ left: scale(national) }}
          title="National average"
        />
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">
        {oos} of {base} inspections that examined the {label.split(' ')[0].toLowerCase()}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children ?? '—'}</dd>
    </div>
  )
}

export interface PacketData {
  profile: CarrierProfile
  authority: CarrierAuthority
  network: CarrierNetwork
  equipment: CarrierEquipment
  safety: CarrierSafety | null
  portal: Portal
}

/**
 * The carrier packet as three printable pages: the safety scorecard, what is hurting the score
 * and how to fix it, and the strengths and record. Red, amber and green always come with an icon
 * and words, so the packet reads the same in black and white. It reports what FMCSA's records
 * show; its one score is the Estimated ISS from the Safety tab, and it gives no verdict.
 */
export function PacketDocument({
  profile,
  authority,
  network,
  equipment,
  safety,
  portal,
}: PacketData) {
  const client = portal === 'client'
  const whose = client ? 'your' : 'this carrier’s'
  const recent = profile.safety.recent
  const sms = safety?.sms ?? null
  const crashes = safety?.crashes ?? null
  const iss = safety?.estimated_iss ?? null
  const drivers = safety?.drivers ?? null
  const { hurting, watch, good } = packetItems(
    profile,
    authority,
    network,
    brokerFlags(network, profile),
    sms,
    crashes,
    iss,
  )
  const tiles = basicTiles(iss, sms, drivers, crashes)
  const summary = improvementSummary(drivers, recent)
  const driverRows = (drivers ?? [])
    .flatMap((b) => b.groups.map((g) => ({ basic: b.basic, group: g })))
    .sort((a, b) => b.group.weight - a.group.weight)
    .slice(0, MAX_DRIVER_ROWS)

  const fleet = equipment.fleet
  const physical = profile.addresses.find((a) => a.address_type === 'PHYSICAL')
  const address = physical
    ? [physical.street, physical.city, [physical.state, physical.zip].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null
  const years = yearsSince(profile.first_registered_date)
  const dockets = authority.dockets.map((d) => `${d.prefix}${d.number}`)
  const docket = authority.dockets[0]
  const bipd = authority.current_insurance.find((f) => f.insurance_type === 'BIPD')
  const oosOrder = network.registration_checks.find((c) => c.key === 'oos')
  const truckYears = equipment.vehicles
    .filter((v) => v.year && v.vehicle_type !== 'TRAILER')
    .map((v) => new Date().getFullYear() - (v.year ?? 0))
  const avgAge = truckYears.length
    ? (truckYears.reduce((a, b) => a + b, 0) / truckYears.length).toFixed(1)
    : null
  const agents = (authority.process_agents ?? []).filter((a) => a.source_system === 'MOTUS')
  const agent = (agents.length ? agents : (authority.process_agents ?? []))[0]
  const events = profile.timeline
    .filter((e) => e.severity === 'HIGH' || e.severity === 'MEDIUM')
    .slice(0, MAX_EVENTS)
  const linked = network.linked_carriers.filter((c) => c.shares.some((s) => s.kind !== 'building'))
  const generated = new Date()
  const carrier = `${profile.legal_name} · USDOT ${profile.usdot_number}`
  // Page 4, FMCSA's record line by line, once its violation file is loaded.
  const record = safety !== null && safety.sms_inspections != null
  const total = record ? 4 : 3

  return (
    <>
      {/* Page 1: the scorecard */}
      <Sheet page={1} total={total} title="Carrier safety scorecard" carrier={carrier}>
        <div className="rounded-xl border border-accent/20 bg-accent-soft px-5 py-4 text-slate-900">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-strong">
            Carrier safety scorecard
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{profile.legal_name}</h1>
          {profile.dba_name && <p className="text-sm text-slate-600">DBA {profile.dba_name}</p>}
          <p className="mt-1 text-sm text-slate-600">
            {[`USDOT ${profile.usdot_number}`, ...dockets, address].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center rounded-xl border border-slate-200 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Estimated ISS safety score
            </div>
            <IssGauge iss={iss} className="w-48" />
          </div>
          <div className="space-y-3">
            {iss && (
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Why this score: </span>
                {iss.reason}.
              </p>
            )}
            <IssTrend iss={iss} history={safety?.iss_history ?? []} />
            <div className="grid gap-2 sm:grid-cols-3">
              <CountPill tone="red" count={hurting.length} label={`Hurting ${whose} score`} />
              <CountPill tone="amber" count={watch.length} label="Worth watching" />
              <CountPill tone="green" count={good.length} label="In good standing" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Heading
            aside={`FMCSA SMS${sms?.snapshot_month ? ` ${new Date(`${sms.snapshot_month}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} results` : ''} · 24 months · thresholds are FMCSA’s`}
          >
            Safety categories (CSA BASICs)
          </Heading>
          <div className="grid gap-2 sm:grid-cols-3">
            {tiles.map((t) => (
              <Tile key={t.key} tile={t} facts={tileFacts(t.key, sms)} />
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <Heading aside={`Last ${recent?.months ?? 24} months`}>Out-of-service rates</Heading>
            {recent ? (
              <>
                <OosBar
                  label="Vehicle out-of-service"
                  rate={recent.vehicle_oos_rate}
                  national={recent.national_vehicle_oos_rate}
                  oos={recent.vehicle_oos}
                  base={recent.vehicle_inspections}
                />
                <OosBar
                  label="Driver out-of-service"
                  rate={recent.driver_oos_rate}
                  national={recent.national_driver_oos_rate}
                  oos={recent.driver_oos}
                  base={recent.driver_inspections}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">No inspections in the last 24 months.</p>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3">
            <Fact label="Inspections">
              {recent?.inspections ?? profile.safety.inspection_count}
            </Fact>
            <Fact label="Last inspection">{formatDate(profile.safety.last_inspection_date)}</Fact>
            <Fact label={`Crashes · ${crashes?.recent_months ?? 24} mo`}>
              {crashes ? crashes.recent_total : null}
            </Fact>
            <Fact label="Fatal · injury">
              {crashes ? `${crashes.recent_fatal} · ${crashes.recent_injury}` : null}
            </Fact>
          </dl>
        </div>

        <div className="break-inside-avoid rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">
            {hurting.length > 0 ? 'Start here: top priorities' : 'Start here'}
          </div>
          {hurting.length > 0 ? (
            <ol className="mt-1.5 space-y-1 text-sm">
              {hurting.slice(0, 3).map((item, i) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-surface">
                    {i + 1}
                  </span>
                  <span className="font-medium text-red-700">{item.title}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CircleCheck className="size-4" aria-hidden />
              Nothing in CarrierSafetyScan’s checks is hurting {whose} score.
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-500">
            {hurting.length + watch.length > 0
              ? 'Page 2 explains each item and what usually fixes it.'
              : 'Page 3 lists what is in good standing.'}
          </p>
        </div>

        <p className="text-[11px] text-slate-500">
          The Estimated ISS is CarrierSafetyScan’s estimate from public FMCSA data using FMCSA’s
          published methods; it is not FMCSA’s official ISS or a safety rating. Details and sources
          on page 3.
        </p>
      </Sheet>

      {/* Page 2: what is hurting the score, and how to fix it */}
      <Sheet page={2} total={total} title="What to fix" carrier={carrier}>
        <div className="space-y-2">
          <Heading aside="Each item names its FMCSA record">
            <span
              className={`flex items-center gap-2 ${hurting.length ? 'text-red-700' : 'text-slate-900'}`}
            >
              <OctagonX className="size-5" aria-hidden />
              What’s hurting {whose} safety score
            </span>
          </Heading>
          {hurting.length === 0 ? (
            <ul>
              <ItemBox
                tone="green"
                item={{
                  key: 'none',
                  title: 'Nothing in CarrierSafetyScan’s checks is hurting the score',
                  detail: 'No BASIC is over its threshold and no record a broker’s check stops on.',
                }}
              />
            </ul>
          ) : (
            <ul className="space-y-2">
              {hurting.slice(0, MAX_HURTING).map((item) => (
                <ItemBox key={item.key} tone="red" item={item} />
              ))}
            </ul>
          )}
          <More count={hurting.length - MAX_HURTING} />
        </div>

        {watch.length > 0 && (
          <div className="space-y-2">
            <Heading>
              <span className="flex items-center gap-2 text-amber-700">
                <TriangleAlert className="size-5" aria-hidden />
                Worth watching
              </span>
            </Heading>
            <ul className="space-y-2">
              {watch.slice(0, MAX_WATCH).map((item) => (
                <ItemBox key={item.key} tone="amber" item={item} />
              ))}
            </ul>
            <More count={watch.length - MAX_WATCH} />
          </div>
        )}

        {driverRows.length > 0 && (
          <div className="space-y-2">
            <Heading aside="FMCSA SMS violations, FMCSA’s severity and time weights">
              Where the violations come from
            </Heading>
            {summary && <p className="text-sm text-slate-700">{summary}</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 font-medium">Violation type</th>
                  <th className="py-1 text-right font-medium">Violations</th>
                  <th className="py-1 text-right font-medium">Out of service</th>
                  <th className="py-1 text-right font-medium">Share of BASIC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top tabular-nums text-slate-700">
                {driverRows.map(({ basic, group }) => {
                  const tip = groupTip(group.group)
                  return (
                    <tr key={`${basic}-${group.group}`}>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-slate-900">{group.group}</span>{' '}
                        <span className="text-xs text-slate-500">({basic})</span>
                        {tip && <span className="block text-xs text-slate-500">{tip}</span>}
                      </td>
                      <td className="py-1.5 text-right">{group.violations}</td>
                      <td
                        className={`py-1.5 text-right ${group.out_of_service > 0 ? 'font-semibold text-red-700' : ''}`}
                      >
                        {group.out_of_service}
                      </td>
                      <td className="py-1.5 text-right">{formatPercent(group.share)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="break-inside-avoid rounded-xl border-2 border-accent bg-accent-soft px-5 py-4">
          <div className="text-base font-semibold text-slate-900">
            {client
              ? hurting.length + watch.length > 0
                ? 'Want help fixing these?'
                : 'Want to keep it this way?'
              : 'Questions about this report?'}
          </div>
          <p className="mt-1 text-sm text-slate-700">
            {client
              ? `${STS_CONTACT.company} can walk you through each item on this page and help you put a plan in place.`
              : `${STS_CONTACT.company} can explain any item on this page.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
            <a
              href={`tel:+1${STS_CONTACT.phone}`}
              className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
            >
              <Phone className="size-4" aria-hidden />
              {formatPhone(STS_CONTACT.phone)}
            </a>
            <a
              href={`mailto:${STS_CONTACT.email}`}
              className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
            >
              <Mail className="size-4" aria-hidden />
              {STS_CONTACT.email}
            </a>
          </div>
        </div>
      </Sheet>

      {/* Page 3: strengths and the record */}
      <Sheet page={3} total={total} title="Strengths and record" carrier={carrier}>
        <div className="space-y-2">
          <Heading aside="Each item names its FMCSA record">
            <span className="flex items-center gap-2 text-emerald-700">
              <CircleCheck className="size-5" aria-hidden />
              In good standing
            </span>
          </Heading>
          <ul className="grid gap-2 sm:grid-cols-2">
            {good.slice(0, MAX_GOOD).map((item) => (
              <li
                key={item.key}
                className="flex break-inside-avoid items-start gap-2 rounded-lg border-l-4 border-emerald-600 bg-emerald-50 px-3 py-1.5 text-sm"
              >
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="font-medium text-slate-900">{item.title}</span>
              </li>
            ))}
          </ul>
          <More count={good.length - MAX_GOOD} />
        </div>

        <div className="space-y-2">
          <Heading aside="FMCSA census, authority, insurance and BOC-3 filings; NHTSA vPIC">
            Key facts
          </Heading>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
            <Fact label="USDOT status">
              {profile.registration_status && humanize(profile.registration_status.toLowerCase())}
            </Fact>
            {authority.dockets.map((d) => (
              <Fact key={`${d.prefix}${d.number}`} label={`Authority ${d.prefix}${d.number}`}>
                {d.status ? humanize(d.status.toLowerCase()) : 'Unknown'}
              </Fact>
            ))}
            <Fact label="Safety rating">
              {profile.safety.safety_rating
                ? humanize(profile.safety.safety_rating.toLowerCase())
                : 'Not rated'}
            </Fact>
            <Fact label="Out-of-service order">
              {oosOrder ? (oosOrder.status === 'alert' ? 'Active' : 'None active') : null}
            </Fact>
            <Fact label="Registered">
              {profile.first_registered_date &&
                `${formatDate(profile.first_registered_date)}${years !== null ? ` · ${years} yr` : ''}`}
            </Fact>
            <Fact label="Operation">
              {classifications(profile.operation_classification)
                .map(classificationLabel)
                .join(', ') || null}
            </Fact>
            <Fact label="Last MCS-150">{formatDate(profile.last_mcs150_date)}</Fact>
            <Fact label="Power units · drivers">
              {`${fleet.registered_power_units ?? '—'} · ${profile.driver_count ?? '—'}`}
            </Fact>
            <Fact label={`Power units seen · ${fleet.recent_months} mo`}>
              {fleet.recent_power_units}
            </Fact>
            <Fact label="Avg truck age">{avgAge && `${avgAge} yr`}</Fact>
            <Fact label="BI&PD on file / required">
              {docket
                ? `${docket.bipd_on_file ? formatMoney(docket.bipd_on_file) : 'None'} / ${
                    docket.bipd_required ? formatMoney(docket.bipd_required) : 'None'
                  }`
                : null}
            </Fact>
            <Fact label="Insurer">{bipd?.insurer}</Fact>
            <Fact label="Cargo · bond">
              {docket
                ? [docket.cargo_required, docket.bond_required]
                    .map((required, i) =>
                      required
                        ? (i === 0 ? docket.cargo_on_file : docket.bond_on_file)
                          ? 'on file'
                          : 'missing'
                        : 'not required',
                    )
                    .join(' · ')
                : null}
            </Fact>
            <Fact label="Process agent (BOC-3)">
              {agent ? agent.name : authority.process_agents ? 'None listed' : null}
            </Fact>
            <Fact label="Phone">
              {profile.phones.map((p) => formatPhone(p.number)).join(', ') || null}
            </Fact>
            <Fact label="Email">{profile.email}</Fact>
          </dl>
        </div>

        {(events.length > 0 || linked.length > 0) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {events.length > 0 && (
              <div className="space-y-1.5">
                <Heading>Recent significant events</Heading>
                <ul className="space-y-1 text-sm text-slate-700">
                  {events.map((e) => (
                    <li key={`${e.event_type}-${e.event_date}-${e.title}`}>
                      <span className="tabular-nums text-slate-500">
                        {formatDate(e.event_date)}
                      </span>{' '}
                      · {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {linked.length > 0 && (
              <div className="space-y-1.5">
                <Heading aside="Relationships to review, not findings">Linked carriers</Heading>
                <ul className="space-y-1 text-sm text-slate-700">
                  {linked.slice(0, MAX_LINKED).map((c) => (
                    <li key={c.usdot_number}>
                      <span className="font-medium text-slate-900">
                        {c.legal_name ?? 'A carrier not in the census'}
                      </span>{' '}
                      <span className="text-slate-500">
                        (USDOT {c.usdot_number}
                        {c.status === 'INACTIVE' && ', not active'})
                      </span>{' '}
                      — same{' '}
                      {c.shares
                        .filter((s) => s.kind !== 'building')
                        .map((s) => s.kind)
                        .join(' and ')}
                    </li>
                  ))}
                </ul>
                <More count={linked.length - MAX_LINKED} />
              </div>
            )}
          </div>
        )}

        <footer className="space-y-1.5 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
          <p>
            Generated {formatLocalDate(generated.toISOString())} from public FMCSA and NHTSA records
            (FMCSA data refreshed {formatLocalDate(profile.last_refreshed_at)}). This Safety Score
            Report shows what the records show; it is not an FMCSA safety rating and not a
            recommendation to use or avoid any carrier. The Estimated ISS is CarrierSafetyScan’s
            estimate from public FMCSA data using FMCSA’s published methods, not FMCSA’s official
            ISS.
          </p>
          <p>
            How FMCSA counts violations: each has a severity weight (1–10, +2 when it put a vehicle
            or driver out of service); newer ones weigh more, and after 24 months they no longer
            count. Clean inspections lower the measures. A wrong inspection or violation can be
            challenged in FMCSA’s DataQs (dataqs.fmcsa.dot.gov).
          </p>
          <p>
            Sources: FMCSA Company Census, inspections, SMS and Crash File, Motus and L&I authority,
            insurance and BOC-3 filings, out-of-service and revocation orders (U.S. DOT Open Data
            Portal); NHTSA vPIC for VIN decoding. Out-of-service rates follow FMCSA’s method (only
            inspections that examined the vehicle or driver count); national averages are FMCSA’s
            published figures.
          </p>
        </footer>
      </Sheet>

      {/* Page 4: the SMS record line by line, and when the score improves */}
      {record && safety && (
        <Sheet page={4} total={total} title="Inspection record" carrier={carrier}>
          <RecordPage safety={safety} client={client} whose={whose} />
        </Sheet>
      )}
    </>
  )
}

/** The carrier packet tab: loads what the other tabs load, then shows the three printable pages. */
export function PacketSection({ profile }: { profile: CarrierProfile }) {
  const authority = useCarrierAuthority(profile.usdot_number)
  const network = useCarrierNetwork(profile.usdot_number)
  const equipment = useCarrierEquipment(profile.usdot_number)
  const safety = useCarrierSafety(profile.usdot_number)
  const portal = usePortalMode()

  if (authority.isPending || network.isPending || equipment.isPending || safety.isPending) {
    return (
      <p className="text-sm text-slate-500">Building the Safety Score Report from FMCSA records…</p>
    )
  }
  if (!authority.data || !network.data || !equipment.data) {
    return (
      <p className="text-sm text-red-700">
        Could not load every section for the Safety Score Report; the individual tabs show what is
        available.
      </p>
    )
  }

  function saveAsPdf() {
    // The browser names the PDF after the page title.
    const title = document.title
    document.title = `CarrierSafetyScan Safety Score Report - ${profile.legal_name} - USDOT ${profile.usdot_number}`
    window.print()
    document.title = title
  }

  const document_ = (
    <PacketDocument
      profile={profile}
      authority={authority.data}
      network={network.data}
      equipment={equipment.data}
      safety={safety.data ?? null}
      portal={portal}
    />
  )
  return (
    <article id="carrier-packet" className="space-y-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-500">
          Four A4 pages: the scorecard, what to fix, the strengths and record, and the inspection
          record with when the score improves.
        </p>
        <button
          type="button"
          onClick={saveAsPdf}
          className="flex items-center gap-2 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink shadow hover:bg-cta-hover active:bg-cta-active"
        >
          <Printer className="size-4" aria-hidden />
          Download / Save as PDF
        </button>
      </div>
      {document_}
      {/* The printed copy sits directly in <body>, outside the app, so the browser prints it at
          full A4 size: inside the app the hidden menu bar and page frame would still take up
          width, and the browser would shrink the whole report to fit them. */}
      {createPortal(
        <div id="carrier-packet-print" className="hidden print:block">
          {document_}
        </div>,
        document.body,
      )}
    </article>
  )
}
