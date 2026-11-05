import type { CarrierSafety } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { basicName } from './basicTiles'
import { OosLabel } from './OosLabel'
import { afterLabel, plainGroup } from './plainLabels'
import {
  heaviestViolations,
  improvementSteps,
  violationCode,
  violationRows,
  violationText,
} from './recordDetail'
import { ScrollX } from './ScrollX'
import { SectionHeading } from './SectionHeading'

/** Caps that keep the record to about one A4 page; more when it has two pages (`part`). */
const MAX_STEPS = 6
const MAX_CRASHES = 6
const MAX_CODES = 10
const MAX_CODES_OWN_PAGE = 9
const MAX_INSPECTIONS = 6
/** On its own page the history table fills the page: inspections are added while their rows fit. */
const MAX_HISTORY_ROWS_OWN_PAGE = 20
const MAX_VIOLATIONS_PER_INSPECTION = 5

const day = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Table rows an inspection takes: its violations shown, plus a "+N lighter" row. */
const historyRows = (violations: number) =>
  Math.min(violations, MAX_VIOLATIONS_PER_INSPECTION) +
  (violations > MAX_VIOLATIONS_PER_INSPECTION ? 1 : 0)

/** How many inspections, newest first, fit in `budget` rows (at least one). */
function inspectionsThatFit(inspections: { violations: unknown[] }[], budget: number) {
  let used = 0
  let count = 0
  for (const i of inspections) {
    used += historyRows(i.violations.length)
    if (used > budget && count > 0) break
    count += 1
  }
  return count
}

const points = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1))

/**
 * Page 4 of the Safety Score Report: FMCSA's SMS record line by line (as on FMCSA's own SMS
 * profile), and what Carrier Safety Scan adds: when the score improves on its own, which violations
 * weigh most (worth checking for a DataQs challenge).
 */
export function RecordPage({
  safety,
  client,
  whose,
  part = 'all',
  fullRecordUrl,
}: {
  safety: CarrierSafety
  client: boolean
  whose: string
  /** A busy record takes two pages (recordNeedsTwoPages): 'summary', then 'history'. */
  part?: 'all' | 'summary' | 'history'
  /** This carrier's page in the app, for what a printed page can't list */
  fullRecordUrl: string
}) {
  const maxCodes = part === 'all' ? MAX_CODES : MAX_CODES_OWN_PAGE
  const inspections = safety.sms_inspections ?? []
  const maxInspections =
    part === 'all' ? MAX_INSPECTIONS : inspectionsThatFit(inspections, MAX_HISTORY_ROWS_OWN_PAGE)
  const steps = improvementSteps(inspections).slice(0, MAX_STEPS)
  const codes = violationRows(inspections)
  const heaviest = heaviestViolations(inspections)
  const crashes = (safety.crashes?.crashes ?? []).filter(
    (c) => new Date(c.report_date) >= new Date(Date.now() - 730 * 24 * 3600 * 1000),
  )

  return (
    <>
      {part !== 'history' && (
        <>
          <div className="grid gap-5 wide:grid-cols-[1.15fr_1fr]">
            <div className="space-y-2">
              <SectionHeading tone="green">When {whose} score improves on its own</SectionHeading>
              {steps.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No violations in FMCSA’s 24-month window, so nothing is waiting to drop off.
                </p>
              ) : (
                <ScrollX>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-1 font-medium">Points drop on</th>
                        <th className="py-1 font-medium">Inspected on</th>
                        <th className="py-1 font-medium">What happens</th>
                        <th className="py-1 text-right font-medium">Points removed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 align-top text-slate-700">
                      {steps.map((s) => (
                        <tr key={`${s.inspection.inspection_id}-${s.change[0]}`}>
                          <td className="whitespace-nowrap py-1 pr-2 font-medium tabular-nums text-slate-900">
                            {day(s.date)}
                          </td>
                          <td className="py-1 pr-2">
                            {formatDate(s.inspection.inspection_date)}
                            {s.inspection.state && ` · ${s.inspection.state}`}
                            <span className="block text-[11px] text-slate-500">
                              {[...new Set(s.basics.map(basicName))].join(', ')}
                            </span>
                          </td>
                          <td className="py-1 pr-2">
                            {s.inspection.violations.length === 1
                              ? `Its violation ${s.change[0]}`
                              : `Its ${s.inspection.violations.length} violations ${s.change[1]}`}
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums text-emerald-700">
                            {points(s.points)} fewer
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollX>
              )}
            </div>

            <div className="break-inside-avoid space-y-2 rounded-xl border-2 border-accent bg-accent-soft px-4 py-3">
              <div className="text-base font-semibold text-slate-950">
                Heaviest violations: check these first
              </div>
              {heaviest.length === 0 ? (
                <p className="text-sm text-slate-700">
                  No violations count in the score right now.
                </p>
              ) : (
                <ol className="space-y-1.5 text-sm text-slate-700">
                  {heaviest.map(({ violation: v, inspection: i, points: worth }, n) => (
                    <li key={`${i.inspection_id}-${v.code}-${n}`} className="flex gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-strong text-[11px] font-bold text-surface">
                        {n + 1}
                      </span>
                      <span>
                        <span className="font-semibold text-slate-900">
                          {plainGroup(v.group)
                            ? `${plainGroup(v.group)}:`
                            : violationText(v.description, v.code)}
                        </span>{' '}
                        {plainGroup(v.group) && (
                          <span className="text-slate-700">
                            {afterLabel(violationText(v.description, v.code), plainGroup(v.group))}{' '}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          ({violationCode(v.code)} · {formatDate(i.inspection_date)}
                          {i.state && ` ${i.state}`} · {points(worth)} points)
                        </span>
                        {v.out_of_service && (
                          <>
                            {' '}
                            <OosLabel />
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-slate-700">
                If one of these is wrong, a DataQs challenge removes its points from the score.
                {client && ' STS files DataQs requests for $50 per inspection.'}
              </p>
            </div>
          </div>

          {codes.length > 0 && (
            <div className="space-y-2">
              <SectionHeading>Violation summary</SectionHeading>
              <ScrollX>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 font-medium">Violation</th>
                      <th className="py-1 pl-3 font-medium">Safety category</th>
                      <th className="w-16 py-1 pl-3 text-center font-medium">Count</th>
                      <th className="w-16 py-1 pl-3 text-center font-medium">Out of service</th>
                      <th className="w-16 py-1 pl-3 text-center font-medium">Severity</th>
                      <th className="py-1 pl-3 font-medium">FMCSA code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 align-top tabular-nums text-slate-700">
                    {codes.slice(0, maxCodes).map((r) => (
                      <tr key={r.code}>
                        <td className="py-1 pr-2">
                          {plainGroup(r.group) && (
                            <span className="font-semibold text-slate-900">
                              {plainGroup(r.group)}:{' '}
                            </span>
                          )}
                          {afterLabel(violationText(r.description, '—'), plainGroup(r.group))}
                        </td>
                        <td className="py-1 pl-3 pr-2 text-xs">{basicName(r.basic)}</td>
                        <td className="py-1 pl-3 text-center">{r.count}</td>
                        <td
                          className={`py-1 pl-3 text-center ${r.outOfService > 0 ? 'font-semibold text-red-700' : ''}`}
                        >
                          {r.outOfService}
                        </td>
                        <td className="py-1 pl-3 text-center">{r.severity}</td>
                        <td className="whitespace-nowrap py-1 pl-3 font-mono text-[11px] text-slate-500">
                          {violationCode(r.code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>
              {codes.length > maxCodes && (
                <p className="text-xs text-slate-500">
                  +{codes.length - maxCodes} more codes after logging in: {fullRecordUrl}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {part !== 'summary' && (
        <>
          <div className="space-y-2">
            <SectionHeading>Inspection history</SectionHeading>
            {inspections.length === 0 ? (
              <p className="text-sm text-slate-600">
                {safety.sms_inspections === null || safety.sms_inspections === undefined
                  ? 'FMCSA’s violation file has not been loaded for this carrier yet.'
                  : 'No inspection in FMCSA’s 24-month window has a violation.'}
              </p>
            ) : (
              <ScrollX>
                {/* Split between inspections when it runs past a printed page (printFit.ts). */}
                <table data-split className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-medium">Date</th>
                      <th className="py-1 pr-2 font-medium">State</th>
                      <th className="py-1 pr-2 font-medium">Report</th>
                      <th className="py-1 pr-2 font-medium">Plate</th>
                      <th className="py-1 pr-2 text-center font-medium">Level</th>
                      <th className="py-1 pr-2 font-medium">Violation</th>
                      <th className="py-1 pr-2 font-medium">Safety category</th>
                      <th className="py-1 pr-2 text-center font-medium">Out of service</th>
                      <th className="py-1 pr-2 text-center font-medium">Severity</th>
                      <th className="py-1 text-center font-medium">Time wt.</th>
                    </tr>
                  </thead>
                  {inspections.slice(0, maxInspections).map((i) => {
                    const shown = i.violations.slice(0, MAX_VIOLATIONS_PER_INSPECTION)
                    const more = i.violations.length - shown.length
                    // The inspection's own details span all of its violation rows.
                    const span = shown.length + (more > 0 ? 1 : 0)
                    const cell = 'py-1 pr-2 align-top text-xs text-slate-700'
                    return (
                      <tbody
                        key={i.inspection_id}
                        className="break-inside-avoid border-b border-slate-200 tabular-nums"
                      >
                        {shown.map((v, n) => (
                          <tr
                            key={`${v.code}-${n}`}
                            className={n > 0 ? 'border-t border-dashed border-slate-100' : ''}
                          >
                            {n === 0 && (
                              <>
                                <td
                                  rowSpan={span}
                                  className={`${cell} whitespace-nowrap font-semibold text-slate-900`}
                                >
                                  {formatDate(i.inspection_date)}
                                </td>
                                <td rowSpan={span} className={cell}>
                                  {i.state ?? '—'}
                                </td>
                                <td rowSpan={span} className={`${cell} font-mono text-[11px]`}>
                                  {i.report_number ?? '—'}
                                </td>
                                <td rowSpan={span} className={cell}>
                                  {i.plate
                                    ? `${i.plate}${i.plate_state ? ` (${i.plate_state})` : ''}`
                                    : '—'}
                                </td>
                                <td rowSpan={span} className={`${cell} text-center`}>
                                  {i.level ?? '—'}
                                </td>
                              </>
                            )}
                            <td
                              className={`py-1 pr-2 align-top text-xs ${v.out_of_service ? 'font-semibold text-red-700' : 'text-slate-800'}`}
                            >
                              {plainGroup(v.group) && (
                                <span className="font-semibold">{plainGroup(v.group)}: </span>
                              )}
                              {afterLabel(
                                violationText(v.description, v.code),
                                plainGroup(v.group),
                              )}
                            </td>
                            <td className={cell}>{basicName(v.basic)}</td>
                            <td className="py-1 pr-2 text-center align-top text-xs text-slate-400">
                              {v.out_of_service ? <OosLabel>Yes</OosLabel> : '—'}
                            </td>
                            <td className={`${cell} text-center`}>{v.severity_weight}</td>
                            <td className="py-1 text-center align-top text-xs text-slate-700">
                              {v.time_weight}
                            </td>
                          </tr>
                        ))}
                        {more > 0 && (
                          <tr>
                            <td colSpan={5} className="pb-1 text-[11px] text-slate-500">
                              +{more} lighter violation{more === 1 ? '' : 's'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    )
                  })}
                </table>
              </ScrollX>
            )}
          </div>

          {crashes.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeading>Crashes, last 24 months</SectionHeading>
              <ul className="space-y-0.5 text-sm text-slate-700">
                {crashes.slice(0, MAX_CRASHES).map((c) => (
                  <li key={c.report_number}>
                    <span className="tabular-nums text-slate-900">{formatDate(c.report_date)}</span>
                    {[c.city, c.state].filter(Boolean).length > 0 &&
                      ` · ${[c.city, c.state].filter(Boolean).join(', ')}`}
                    {' · '}
                    {[
                      c.fatalities > 0 && `${c.fatalities} fatal`,
                      c.injuries > 0 && `${c.injuries} injured`,
                      c.tow_away && 'tow-away',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'reported'}
                  </li>
                ))}
              </ul>
              {crashes.length > MAX_CRASHES && (
                <p className="text-xs text-slate-500">
                  +{crashes.length - MAX_CRASHES} more after logging in: {fullRecordUrl}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
