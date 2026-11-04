import {
  CircleCheck,
  CircleMinus,
  OctagonX,
  Printer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'

import { useCarrierAuthority } from '../../../hooks/useCarrierAuthority'
import { useCarrierEquipment } from '../../../hooks/useCarrierEquipment'
import { useCarrierSafety, useLatestCarrierInspections } from '../../../hooks/useCarrierSafety'
import { useCarrierNetwork } from '../../../hooks/useNetwork'
import { usePortalMode } from '../../../hooks/usePortalMode'
import type { Portal } from '../../../types/auth'
import type { CarrierAuthority } from '../../../types/carrierAuthority'
import type { CarrierEquipment } from '../../../types/carrierEquipment'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierSafety, InspectionDetail } from '../../../types/carrierSafety'
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
import { basicName, basicTiles, type BasicTile, type TileTone } from './basicTiles'
import { ContactStrip } from './ContactStrip'
import logo from '../../../assets/carriersafetyscan-logo.png'
import { authorityEventsToReview, packetItems, type PacketItem } from './packetItems'
import { FixWithSky } from '../FixWithSky'
import { afterLabel, plainGroup } from './plainLabels'
import { InspectionList } from './InspectionList'
import { paginateReport, PrintCopy, type PageNumbers } from './printFit'
import { PullInRates } from './PullInRates'
import { RecordPage } from './RecordPage'
import { ScrollX } from './ScrollX'
import { SectionHeading } from './SectionHeading'
import { solutions } from './solutions'
import { SolutionsBox } from './SolutionsBox'
import {
  cleanInspections,
  heaviestTruck,
  recordNeedsTwoPages,
  repeatViolations,
  tileFacts,
  violationCode,
  violationText,
} from './recordDetail'

/** Where each sheet lands in print (printFit.ts paginateReport); null until it is laid out. */
const Pages = createContext<PageNumbers | null>(null)

/** Caps that keep each section short; the report itself runs to as many pages as it needs. */
const MAX_DRIVER_ROWS = 4
/** Steps in page 2's plan; fewer when the page is already full */
const PLAN_STEPS = 6
const PLAN_STEPS_BUSY = 4
const MAX_EVENTS = 5
const MAX_HISTORY_EVENTS = 6
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

/**
 * One part of the report: a running header, then its sections. In print it covers one or more A4
 * pages (printFit.ts), each with the header and the Sky Transport Solutions strip.
 */
function Sheet({
  index,
  title,
  carrier,
  contact,
  children,
}: {
  /** Its place in the report, from 0: which printed pages it covers comes from `Pages` */
  index: number
  title: string
  carrier: string
  /** The page's line for the Sky Transport Solutions strip at its bottom */
  contact?: string
  children: ReactNode
}) {
  const printed = useContext(PrintCopy)
  const pages = useContext(Pages)
  const first = pages?.first[index]
  const last = pages?.last[index]
  // Printed, each page's own number is filled in when the pages are laid out.
  const number = printed
    ? '·'
    : pages && first && last
      ? `· ${first === last ? `Page ${first}` : `Pages ${first}–${last}`} of ${pages.total}`
      : ''
  const sheet = (
    <section
      data-title={title}
      className={
        printed
          ? 'packet-sheet flex flex-col space-y-4 bg-white'
          : 'packet-sheet flex flex-col space-y-5 rounded-xl border border-slate-200 bg-surface p-4 wide:p-8'
      }
    >
      <div
        className={`flex items-center justify-between border-b border-slate-200 pb-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 ${printed ? 'gap-4' : 'flex-wrap gap-x-4 gap-y-1'}`}
      >
        <span
          className={`flex items-center gap-1.5 ${printed ? 'shrink-0 whitespace-nowrap' : 'flex-wrap wide:shrink-0 wide:whitespace-nowrap'}`}
        >
          <img src={logo} alt="" className="size-5 object-contain" />
          <span className="text-[12px] font-semibold normal-case tracking-normal text-slate-900">
            CarrierSafetyScan
          </span>
          <span className="normal-case tracking-normal text-slate-600">
            Powered by{' '}
            <span className="font-semibold text-violet-700">Sky Transport Solutions</span>
          </span>{' '}
          · {title}
        </span>
        <span className="flex min-w-0 gap-1 normal-case tracking-normal">
          <span className="truncate">{carrier}</span>
          <span data-page-number className="shrink-0 whitespace-nowrap">
            {number}
          </span>
        </span>
      </div>
      {printed ? (
        // Printed: the sections follow the heading; this grows so the strip sits at the page's bottom.
        <div className="sheet-body flex flex-1 flex-col gap-4">{children}</div>
      ) : (
        children
      )}
      {contact && (
        // Printed: the page's sections are spread over the whole A4 page (justify-between), so
        // the strip ends up at its bottom anyway; on screen it follows the content.
        <div className={printed ? 'pt-1' : 'mt-auto pt-1'}>
          <ContactStrip message={contact} />
        </div>
      )}
    </section>
  )
  // Printed: each sheet sits on its own A4 page with the margins drawn inside it, so the browser
  // has no margin to print its date, title and page address in (index.css .print-page).
  return printed ? <div className="print-page">{sheet}</div> : sheet
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

function ItemBox({
  tone,
  item,
  solution,
}: {
  tone: TileTone
  item: PacketItem
  /** A red item's fix, shown right under it in place of "What usually fixes it" */
  solution?: { title: string | null; how: string } | null
}) {
  const { box, icon, title, Icon } = TONE[tone]
  return (
    <li className={`break-inside-avoid rounded-lg border-l-4 px-3 py-2 ${box}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} aria-hidden />
        <div className="min-w-0 text-sm">
          <div className={`font-semibold ${title}`}>{item.title}</div>
          {item.detail && <p className="mt-0.5 text-slate-700">{item.detail}</p>}
          {solution ? (
            <p className="mt-1.5 rounded-md border border-emerald-200 bg-white/80 px-2.5 py-1 text-slate-700">
              <span className="font-semibold text-emerald-700">How to fix it: </span>
              {solution.title && (
                <span className="font-semibold text-slate-900">{solution.title}. </span>
              )}
              {solution.how}
            </p>
          ) : (
            item.fix && (
              <p className="mt-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">What usually fixes it:</span>{' '}
                {item.fix}
              </p>
            )
          )}
          {tone !== 'green' && <FixWithSky topic={item.title} />}
        </div>
      </div>
    </li>
  )
}

function More({ count, url }: { count: number; url: string }) {
  if (count <= 0) return null
  return (
    <p className="text-xs text-slate-500">
      +{count} more after logging in: {url}
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
    <div className="min-w-0 break-inside-avoid">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-sm font-medium text-slate-900">{children ?? '—'}</dd>
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
  /** The latest inspections on file, newest first, listed at the end; null: not loaded */
  inspections?: InspectionDetail[] | null
  /** How many inspections are on file in all */
  inspectionTotal?: number
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
  inspections = null,
  inspectionTotal,
}: PacketData) {
  const client = portal === 'client'
  const whose = client ? 'your' : 'this carrier’s'
  const recent = profile.safety.recent
  const sms = safety?.sms ?? null
  const crashes = safety?.crashes ?? null
  const iss = safety?.estimated_iss ?? null
  const drivers = safety?.drivers ?? null
  const { hurting, redFlags, watch, roadside, good } = packetItems(
    profile,
    authority,
    network,
    brokerFlags(network, profile),
    sms,
    crashes,
    iss,
    equipment.fleet,
  )
  const tiles = basicTiles(iss, sms, drivers, crashes)
  const clean = safety ? cleanInspections(safety) : null
  const truck = heaviestTruck(safety?.sms_inspections ?? [])
  const repeats = repeatViolations(safety?.sms_inspections ?? [])
  const summary = improvementSummary(drivers, recent)
  // Many red and amber items already: the plan keeps to its four most important steps, so the
  // report stays short.
  const busy = hurting.length + redFlags.length + watch.length + roadside.length >= 6
  const plan = solutions({
    iss,
    sms,
    drivers,
    recent,
    inspections: safety?.sms_inspections ?? null,
    truck,
    fleet: equipment.fleet,
    client,
    max: busy ? PLAN_STEPS_BUSY : PLAN_STEPS,
  })
  // Each red item carries its fix right under it: its step of the plan when there is one (same
  // key), else what usually fixes it. The plan's other steps follow later, after the scorecard.
  const solutionFor = (item: PacketItem) => {
    const step = plan.find((s) => s.key === item.key)
    return step
      ? { title: step.title, how: step.how }
      : item.fix
        ? { title: null, how: item.fix }
        : null
  }
  const red = [...hurting, ...redFlags]
  const morePlan = plan.filter((s) => !red.some((item) => item.key === s.key))
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
  const allEvents = profile.timeline.filter((e) => e.severity === 'HIGH' || e.severity === 'MEDIUM')
  const events = allEvents.slice(0, MAX_EVENTS)
  const linked = network.linked_carriers.filter((c) => c.shares.some((s) => s.kind !== 'building'))
  const generated = new Date()
  const fullRecordUrl = `${window.location.origin}/c/${profile.usdot_number}`
  const allToReview = authorityEventsToReview(authority)
  const toReview = allToReview.slice(0, MAX_HISTORY_EVENTS)
  const docketStatus = (docket: string) =>
    authority.dockets.find((d) => `${d.prefix}${d.number}` === docket)?.status ?? null
  const carrier = `${profile.legal_name} · USDOT ${profile.usdot_number}`
  // Page 4, FMCSA's record line by line, once its violation file is loaded.
  const record = safety !== null && safety.sms_inspections != null
  // A busy record gets two parts: the summary, then the inspection history.
  const twoRecordPages = record && safety !== null && recordNeedsTwoPages(safety)
  const listed = inspections !== null && inspections.length > 0
  // Each page's line in the Sky Transport Solutions strip: what that page is about.
  const ask =
    'Questions about this report? A Sky Transport Solutions specialist can explain any item.'
  const contact = {
    scorecard: client
      ? 'Want a lower safety score? Talk to a Sky Transport Solutions specialist.'
      : ask,
    record: client
      ? 'Keep your record clean: Sky Transport Solutions handles company updates (MCS-150), insurance and process agent (BOC-3) filings.'
      : ask,
    fixes: client
      ? hurting.length + redFlags.length + watch.length > 0
        ? 'Want help fixing these? A Sky Transport Solutions specialist can walk you through each item.'
        : 'Want to keep it this way? A Sky Transport Solutions specialist can help you stay compliant.'
      : ask,
    inspections: client
      ? 'Found a wrong violation? Sky Transport Solutions files DataQs challenges for $50 per inspection.'
      : ask,
  }

  const whereFrom = driverRows.length > 0 && (
    <div className="space-y-2">
      <SectionHeading aside="FMCSA safety data: how serious each violation is and how recent">
        Where the violations come from
      </SectionHeading>
      {summary && <p className="text-sm text-slate-700">{summary}</p>}
      <ScrollX>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 font-medium">Violation type</th>
              <th className="w-20 py-1 pl-3 text-right font-medium">Violations</th>
              <th className="w-20 py-1 pl-3 text-right font-medium">Out of service</th>
              <th className="w-20 py-1 pl-3 text-right font-medium">Share of category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top tabular-nums text-slate-700">
            {driverRows.map(({ basic, group }) => {
              const tip = groupTip(group.group)
              return (
                <tr key={`${basic}-${group.group}`}>
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-slate-900">{plainGroup(group.group)}</span>{' '}
                    <span className="text-xs text-slate-500">({basicName(basic)})</span>
                    {/* The plan above has these in plain words. */}
                    {tip && plan.length === 0 && (
                      <span className="block text-xs text-slate-500">{tip}</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-3 text-right">{group.violations}</td>
                  <td
                    className={`py-1.5 pl-3 text-right ${group.out_of_service > 0 ? 'font-semibold text-red-700' : ''}`}
                  >
                    {group.out_of_service}
                  </td>
                  <td className="py-1.5 pl-3 text-right">{formatPercent(group.share)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollX>
    </div>
  )

  // Patterns in the violations: on page 2, or at the top of page 3 when page 2 is full.
  const patterns = (truck || repeats.length > 0) && (
    <div className="space-y-2">
      <SectionHeading aside="FMCSA safety data, last 24 months" tone="amber">
        Patterns in the violations
      </SectionHeading>
      {truck && (
        <ul>
          <ItemBox
            tone="amber"
            item={{
              key: 'truck',
              title: `One truck carries ${formatPercent(truck.points / truck.total)} of the Vehicle Maintenance points on the carrier’s trucks`,
              detail: `VIN ${truck.vin}${truck.plates.length ? ` (plate ${truck.plates.join(', ')})` : ''}: ${Math.round(truck.points)} of the ${Math.round(truck.total)} points recorded on the ${truck.trucks} inspected trucks themselves (trailer violations not counted), from ${truck.violations} violation${truck.violations === 1 ? '' : 's'} on ${truck.inspections} inspection${truck.inspections === 1 ? '' : 's'}.${truck.unmatched ? ` ${truck.unmatched} inspection${truck.unmatched === 1 ? '' : 's'} with truck violations couldn’t be matched to a truck and ${truck.unmatched === 1 ? 'is' : 'are'} left out.` : ''}`,
              fix: 'Repairs and pre-trip checks on this truck first.',
            }}
          />
        </ul>
      )}
      {repeats.length > 0 && (
        <div className="break-inside-avoid rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <div className="font-semibold text-slate-900">Cited again and again</div>
          <p className="text-xs text-slate-600">
            The same violation on more than one inspection usually points to a gap in maintenance or
            pre-trip checks rather than bad luck.
          </p>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {repeats.map((r) => (
              <li key={r.code} className="flex justify-between gap-3">
                <span>
                  {plainGroup(r.group) && (
                    <span className="font-medium">{plainGroup(r.group)}: </span>
                  )}
                  {afterLabel(
                    violationText(r.description, violationCode(r.code)),
                    plainGroup(r.group),
                  )}{' '}
                  <span className="text-xs text-slate-500">
                    ({basicName(r.basic)} · {violationCode(r.code)})
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                  {r.inspections} inspections
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
  // "How to improve" only when it has something to say.
  const improve = morePlan.length > 0 || Boolean(whereFrom) || Boolean(patterns)
  return (
    <>
      {/* Page 1: the scorecard */}
      <Sheet
        index={0}
        title="Carrier safety scorecard"
        carrier={carrier}
        contact={contact.scorecard}
      >
        {/* "Carrier safety scorecard" is in the running header above it. */}
        <div className="flex items-center gap-4 rounded-xl border border-accent/20 bg-accent-soft px-5 py-3 text-slate-900">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{profile.legal_name}</h1>
            {profile.dba_name && <p className="text-sm text-slate-600">DBA {profile.dba_name}</p>}
            <p className="mt-1 text-sm text-slate-600">
              {[`USDOT ${profile.usdot_number}`, ...dockets, address].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* The score large, with what explains it and the counts beside it, so the red items
            below start on the first page. Its month-by-month history follows the findings. */}
        <div className="grid items-center gap-5 wide:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center rounded-xl border border-slate-200 px-5 py-3">
            <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
              Estimated ISS safety score
            </div>
            <IssGauge iss={iss} className="w-60" large />
          </div>
          <div className="space-y-3">
            {iss && (
              <p className="text-base text-slate-700">
                <span className="font-semibold text-slate-900">Why this score: </span>
                {iss.reason}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <CountPill tone="red" count={hurting.length} label={`Hurting ${whose} score`} />
              {redFlags.length > 0 && (
                <CountPill tone="red" count={redFlags.length} label="Broker red flags" />
              )}
              <CountPill
                tone="amber"
                count={watch.length + roadside.length}
                label="Worth watching"
              />
              <CountPill tone="green" count={good.length} label="In good standing" />
            </div>
            {safety && <PullInRates safety={safety} client={client} />}
          </div>
        </div>

        {/* Ranked by how much each matters: red (each with its fix), then yellow, then green. */}
        <div className="space-y-2">
          <SectionHeading
            aside="Each item names its FMCSA record"
            tone={hurting.length ? 'red' : 'green'}
          >
            <span
              className={`flex items-center gap-2 ${hurting.length ? 'text-red-700' : 'text-slate-900'}`}
            >
              <OctagonX className="size-5" aria-hidden />
              What’s hurting {whose} safety score
            </span>
          </SectionHeading>
          {hurting.length === 0 ? (
            <ul>
              <ItemBox
                tone="green"
                item={{
                  key: 'none',
                  title: 'Nothing in CarrierSafetyScan’s checks is hurting the score',
                  detail:
                    'No safety category is over its threshold or under an FMCSA alert, and FMCSA’s Crash File lists no fatal crash in the last 24 months.',
                }}
              />
            </ul>
          ) : (
            <ul data-split className="space-y-2">
              {hurting.map((item) => (
                <ItemBox key={item.key} tone="red" item={item} solution={solutionFor(item)} />
              ))}
            </ul>
          )}
        </div>

        {redFlags.length > 0 && (
          <div className="space-y-2">
            <SectionHeading
              aside="Doesn’t feed the Estimated ISS; a broker’s check may stop on these"
              tone="red"
            >
              <span className="flex items-center gap-2 text-red-700">
                <OctagonX className="size-5" aria-hidden />
                Broker red flags
              </span>
            </SectionHeading>
            <ul data-split className="space-y-2">
              {redFlags.map((item) => (
                <ItemBox key={item.key} tone="red" item={item} solution={solutionFor(item)} />
              ))}
            </ul>
          </div>
        )}

        {roadside.length > 0 && (
          <div className="space-y-2">
            <SectionHeading aside="Doesn’t feed the Estimated ISS directly" tone="amber">
              <span className="flex items-center gap-2 text-amber-700">
                <TriangleAlert className="size-5" aria-hidden />
                Roadside risk
              </span>
            </SectionHeading>
            <ul data-split className="space-y-2">
              {roadside.map((item) => (
                <ItemBox key={item.key} tone="amber" item={item} />
              ))}
            </ul>
          </div>
        )}

        {watch.length > 0 && (
          <div className="space-y-2">
            <SectionHeading tone="amber">
              <span className="flex items-center gap-2 text-amber-700">
                <TriangleAlert className="size-5" aria-hidden />
                Worth watching
              </span>
            </SectionHeading>
            <ul data-split className="space-y-2">
              {watch.map((item) => (
                <ItemBox key={item.key} tone="amber" item={item} />
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <SectionHeading
            tone="green"
            aside={
              red.length + roadside.length + watch.length > 0
                ? 'These records are in order'
                : 'Each item names its FMCSA record'
            }
          >
            <span className="flex items-center gap-2 text-emerald-700">
              <CircleCheck className="size-5" aria-hidden />
              In good standing
            </span>
          </SectionHeading>
          <ul data-split className="grid gap-2 wide:grid-cols-2">
            {good.map((item) => (
              <li
                key={item.key}
                className="flex break-inside-avoid items-start gap-2 rounded-lg border-l-4 border-emerald-600 bg-emerald-50 px-3 py-1.5 text-sm"
              >
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                <span className="font-medium text-slate-900">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>

        <IssTrend iss={iss} history={safety?.iss_history ?? []} />

        <div className="space-y-2">
          <SectionHeading
            aside={`FMCSA safety data (SMS)${sms?.snapshot_month ? ` ${new Date(`${sms.snapshot_month}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} results` : ''} · 24 months · thresholds are FMCSA’s`}
          >
            Safety categories (CSA BASICs)
          </SectionHeading>
          <div data-split className="grid gap-2 wide:grid-cols-3">
            {tiles.map((t) => (
              <Tile key={t.key} tile={t} facts={tileFacts(t.key, sms, drivers)} />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Percentile: how the carrier ranks against similar carriers; 0 is best, 100 is worst.
            Threshold: the percentile at which FMCSA may step in. Measure: violation points divided
            by inspections, or by fleet size and miles.
          </p>
        </div>

        <div className="grid gap-5 wide:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <SectionHeading aside={`Last ${recent?.months ?? 24} months`}>
              Out-of-service rates
            </SectionHeading>
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
            {clean && (
              <Fact label="Clean inspections (24 mo)">
                {`${clean.clean} of ${clean.total} (${formatPercent(clean.clean / clean.total)})`}
              </Fact>
            )}
          </dl>
          <p className="text-[11px] text-slate-500 wide:col-span-2">
            Why these counts differ: Inspections counts every inspection FMCSA has loaded for the
            last 24 months. Out-of-service rates count only those that examined the vehicle or the
            driver. Clean inspections use FMCSA’s monthly safety results, which can leave out the
            most recent inspections.
          </p>
        </div>

        <p className="text-[11px] text-slate-500">
          The Estimated ISS is CarrierSafetyScan’s estimate from public FMCSA data using FMCSA’s
          published methods; it is not FMCSA’s official ISS or a safety rating. Details and sources
          at the end of “Record and sources”.
        </p>
      </Sheet>

      {/* The rest of the plan, and where the violations come from */}
      {improve && (
        <Sheet index={1} title="How to improve" carrier={carrier} contact={contact.fixes}>
          <SolutionsBox
            steps={morePlan}
            title={
              morePlan.length < plan.length
                ? 'More ways to improve the Safety Score'
                : 'Solutions on improving the Safety Score'
            }
          />
          <SolutionsBox steps={plan} />

          {whereFrom}

          {patterns}
        </Sheet>
      )}

      {/* The record: authority history, key facts, events, linked carriers, sources */}
      <Sheet
        index={improve ? 2 : 1}
        title="Record and sources"
        carrier={carrier}
        contact={contact.record}
      >
        {toReview.length > 0 && (
          <div className="space-y-2">
            <SectionHeading aside="FMCSA authority history" tone="amber">
              <span className="text-amber-700">History to review</span>
            </SectionHeading>
            <p className="text-xs text-slate-600">
              Past actions on this carrier’s authority. A past action doesn’t show today’s status,
              so each line gives the status FMCSA lists now.
            </p>
            <ul className="divide-y divide-slate-100 text-sm text-slate-700">
              {toReview.map((a) => (
                <li
                  key={`${a.docket}-${a.action_date}-${a.action}`}
                  className="flex flex-wrap justify-between gap-x-3 py-1"
                >
                  <span>
                    <span className="tabular-nums text-slate-900">{formatDate(a.action_date)}</span>{' '}
                    · {a.docket} · {a.action}
                  </span>
                  <span className="text-xs">
                    Status now: {docketStatus(a.docket) ?? 'not listed'}
                  </span>
                </li>
              ))}
            </ul>
            <More count={allToReview.length - toReview.length} url={fullRecordUrl} />
          </div>
        )}
        <div className="space-y-2">
          <SectionHeading aside="FMCSA census, authority, insurance and BOC-3 filings; NHTSA vPIC">
            Key facts
          </SectionHeading>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 wide:grid-cols-4">
            <Fact label="USDOT status">
              {profile.registration_status && humanize(profile.registration_status.toLowerCase())}
            </Fact>
            {authority.dockets.map((d) => (
              <Fact key={`${d.prefix}${d.number}`} label={`Authority ${d.prefix}${d.number}`}>
                {d.status ? humanize(d.status.toLowerCase()) : 'Unknown'}
              </Fact>
            ))}
            <Fact label="Safety rating">
              {profile.safety.safety_rating ? (
                <>
                  {humanize(profile.safety.safety_rating.toLowerCase())}
                  {profile.safety.safety_rating_date &&
                    ` · rated ${formatDate(profile.safety.safety_rating_date)}`}
                  {/* A good rating next to a poor score looks contradictory: they are two
                      separate FMCSA measures (FMCSA SAFER shows both). */}
                  {profile.safety.safety_rating === 'SATISFACTORY' &&
                    iss?.value != null &&
                    iss.value >= 75 && (
                      <span className="mt-0.5 block text-xs font-normal text-slate-600">
                        A safety rating comes from an FMCSA review of the carrier’s records; the ISS
                        comes from roadside inspections and crashes.
                      </span>
                    )}
                </>
              ) : (
                'Not rated'
              )}
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
            <Fact label="Last company update (MCS-150)">
              {formatDate(profile.last_mcs150_date)}
            </Fact>
            <Fact label="Power units · drivers">
              {`${fleet.registered_power_units ?? '—'} · ${profile.driver_count ?? '—'}`}
            </Fact>
            <Fact label={`Power units seen · ${fleet.recent_months} mo`}>
              {fleet.recent_power_units}
            </Fact>
            <Fact label="Avg truck age">{avgAge && `${avgAge} yr`}</Fact>
            <Fact label="Liability insurance (BI&PD) on file / required">
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
          <div className="grid gap-5 wide:grid-cols-2">
            {events.length > 0 && (
              <div className="space-y-1.5">
                <SectionHeading aside="FMCSA records">Recent significant events</SectionHeading>
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
                <More count={allEvents.length - events.length} url={fullRecordUrl} />
              </div>
            )}
            {linked.length > 0 && (
              <div className="space-y-1.5">
                <SectionHeading aside="Relationships to review, not findings">
                  Linked carriers
                </SectionHeading>
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
                <More count={linked.length - MAX_LINKED} url={fullRecordUrl} />
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
            Words used: BASIC is FMCSA’s name for a safety category. MCS-150 is the company update
            form every carrier files with FMCSA. BOC-3 is the filing that names a carrier’s process
            agents, who accept legal papers for it. BI&amp;PD is liability insurance for injuries
            and property damage. Out of service means FMCSA’s inspector stopped the truck or driver
            until the problem was fixed. SMS is FMCSA’s Safety Measurement System.
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

      {/* The SMS record line by line, and when the score improves */}
      {record && safety && (
        <Sheet
          index={improve ? 3 : 2}
          title="Inspection record"
          carrier={carrier}
          contact={contact.inspections}
        >
          <RecordPage
            fullRecordUrl={fullRecordUrl}
            safety={safety}
            client={client}
            whose={whose}
            part={twoRecordPages ? 'summary' : 'all'}
            listedAtEnd={listed ? inspections.length : 0}
          />
        </Sheet>
      )}
      {/* For a busy record: the inspection history, crashes and pull-in rates */}
      {twoRecordPages && safety && (
        <Sheet
          index={improve ? 4 : 3}
          title="Inspection history"
          carrier={carrier}
          contact={contact.inspections}
        >
          <RecordPage
            fullRecordUrl={fullRecordUrl}
            safety={safety}
            client={client}
            whose={whose}
            part="history"
            listedAtEnd={listed ? inspections.length : 0}
          />
        </Sheet>
      )}
      {/* Last: every inspection on file, each one listed */}
      {listed && (
        <Sheet
          index={(improve ? 3 : 2) + (record ? (twoRecordPages ? 2 : 1) : 0)}
          title="Latest inspections"
          carrier={carrier}
          contact={contact.inspections}
        >
          <InspectionList
            inspections={inspections}
            total={inspectionTotal ?? inspections.length}
            usdotNumber={profile.usdot_number}
            fullRecordUrl={fullRecordUrl}
          />
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
  const inspections = useLatestCarrierInspections(profile.usdot_number)
  const portal = usePortalMode()
  const printCopy = useRef<HTMLDivElement>(null)
  const printPages = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<PageNumbers | null>(null)

  // Lay the report out on A4 pages whenever it changes, once fonts have loaded, and again just
  // before printing; the page numbers then show on screen too.
  useLayoutEffect(() => {
    const source = printCopy.current
    const out = printPages.current
    if (!source || !out) return
    const layout = () => {
      const next = paginateReport(source, out)
      if (next && JSON.stringify(next) !== JSON.stringify(pages)) setPages(next)
    }
    layout()
    void document.fonts?.ready.then(layout)
    window.addEventListener('beforeprint', layout)
    return () => window.removeEventListener('beforeprint', layout)
  })

  if (
    authority.isPending ||
    network.isPending ||
    equipment.isPending ||
    safety.isPending ||
    inspections.isPending
  ) {
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
      inspections={inspections.data?.inspections ?? null}
      inspectionTotal={inspections.data?.total}
    />
  )
  return (
    <article id="carrier-packet" className="space-y-6 print:hidden">
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={saveAsPdf}
          className="flex items-center gap-2 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink shadow hover:bg-cta-hover active:bg-cta-active"
        >
          <Printer className="size-4" aria-hidden />
          Download / Save as PDF
        </button>
      </div>
      <Pages.Provider value={pages}>{document_}</Pages.Provider>
      {/* The printed copy sits directly in <body>, outside the app, so the browser prints it at
          full A4 size (inside the app the hidden menu bar would make it shrink everything). It is
          laid out off-screen at the printed width, and paginateReport copies it onto A4 pages in
          #carrier-packet-pages, which is what prints. */}
      {createPortal(
        <>
          <div id="carrier-packet-print" ref={printCopy} aria-hidden>
            <PrintCopy.Provider value>{document_}</PrintCopy.Provider>
          </div>
          <div id="carrier-packet-pages" ref={printPages} aria-hidden />
        </>,
        document.body,
      )}
    </article>
  )
}
