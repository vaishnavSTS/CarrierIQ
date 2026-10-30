import { CalendarClock, Scale } from 'lucide-react'

import type { CarrierSafety } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { heaviestViolations, improvementSteps, violationCode, violationRows } from './recordDetail'
import { ScrollX } from './ScrollX'
import { SectionHeading } from './SectionHeading'

/** Caps that keep the record to about one A4 page; more when it has two pages (`part`). */
const MAX_STEPS = 6
const MAX_CODES = 10
const MAX_CODES_OWN_PAGE = 9
const MAX_INSPECTIONS = 6
/** On its own page the history table fills the page: inspections are added while their rows fit. */
const MAX_HISTORY_ROWS_OWN_PAGE = 22
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
 * profile), and what CarrierSafetyScan adds: when the score improves on its own, which violations
 * weigh most (worth checking for a DataQs challenge).
 */
export function RecordPage({
  safety,
  client,
  whose,
  part = 'all',
}: {
  safety: CarrierSafety
  client: boolean
  whose: string
  /** A busy record takes two pages (recordNeedsTwoPages): 'summary', then 'history'. */
  part?: 'all' | 'summary' | 'history'
}) {
  const maxCodes = part === 'all' ? MAX_CODES : MAX_CODES_OWN_PAGE
  const inspections = safety.sms_inspections ?? []
  const maxInspections =
    part === 'all' ? MAX_INSPECTIONS : inspectionsThatFit(inspections, MAX_HISTORY_ROWS_OWN_PAGE)
  const steps = improvementSteps(inspections).slice(0, MAX_STEPS)
  const codes = violationRows(inspections)
  const heaviest = heaviestViolations(inspections)
  const clean = Math.max(0, (safety.sms?.inspections ?? 0) - inspections.length)
  const crashes = (safety.crashes?.crashes ?? []).filter(
    (c) => new Date(c.report_date) >= new Date(Date.now() - 730 * 24 * 3600 * 1000),
  )

  return (
    <>
      {part !== 'history' && (
        <>
          <div className="grid gap-5 sm:grid-cols-[1.15fr_1fr]">
            <div className="space-y-2">
              <SectionHeading
                tone="green"
                aside="FMCSA time weights: 3× for 6 months, 2× to 12, 1× to 24; applied at FMCSA’s next monthly update"
              >
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-5 text-emerald-600" aria-hidden />
                  When {whose} score improves on its own
                </span>
              </SectionHeading>
              {steps.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No violations in FMCSA’s 24-month window, so nothing is waiting to drop off.
                </p>
              ) : (
                <ScrollX>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-1 font-medium">Date</th>
                        <th className="py-1 font-medium">Inspection</th>
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
                              {s.basics.join(', ')}
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
              <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Scale className="size-5 text-accent-strong" aria-hidden />
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
                          {v.description ?? v.code}
                        </span>{' '}
                        <span className="text-xs text-slate-500">
                          ({violationCode(v.code)} · {formatDate(i.inspection_date)}
                          {i.state && ` ${i.state}`} · {points(worth)} points
                          {v.out_of_service && ', out of service'})
                        </span>
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
              <SectionHeading
                aside={`FMCSA SMS · ${codes.reduce((n, r) => n + r.count, 0)} violations`}
              >
                Violation summary
              </SectionHeading>
              <ScrollX>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 font-medium">Code</th>
                      <th className="py-1 font-medium">Description</th>
                      <th className="py-1 pl-3 font-medium">BASIC</th>
                      <th className="w-16 py-1 pl-3 text-center font-medium">Count</th>
                      <th className="w-16 py-1 pl-3 text-center font-medium" title="Out of service">
                        OOS
                      </th>
                      <th className="w-16 py-1 pl-3 text-center font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 align-top tabular-nums text-slate-700">
                    {codes.slice(0, maxCodes).map((r) => (
                      <tr key={r.code}>
                        <td className="whitespace-nowrap py-1 pr-2 font-mono text-[11px] text-slate-900">
                          {violationCode(r.code)}
                        </td>
                        <td className="py-1 pr-2">
                          {/* One line here: the inspection history below has each one in full. */}
                          <span className="line-clamp-1">{r.description ?? '—'}</span>
                        </td>
                        <td className="py-1 pl-3 pr-2 text-xs">{r.basic}</td>
                        <td className="py-1 pl-3 text-center">{r.count}</td>
                        <td
                          className={`py-1 pl-3 text-center ${r.outOfService > 0 ? 'font-semibold text-red-700' : ''}`}
                        >
                          {r.outOfService}
                        </td>
                        <td className="py-1 pl-3 text-center">{r.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>
              {codes.length > maxCodes && (
                <p className="text-xs text-slate-500">
                  +{codes.length - maxCodes} more codes on the Safety tab in CarrierSafetyScan.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {part !== 'summary' && (
        <>
          <div className="space-y-2">
            <SectionHeading
              aside={`${inspections.length} with violations · ${clean} without, in FMCSA’s 24 months`}
            >
              Inspection history
            </SectionHeading>
            {inspections.length === 0 ? (
              <p className="text-sm text-slate-600">
                {safety.sms_inspections === null || safety.sms_inspections === undefined
                  ? 'FMCSA’s violation file has not been loaded for this carrier yet.'
                  : 'No inspection in FMCSA’s 24-month window has a violation.'}
              </p>
            ) : (
              <ScrollX>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-medium">Date</th>
                      <th className="py-1 pr-2 font-medium">State</th>
                      <th className="py-1 pr-2 font-medium">Report</th>
                      <th className="py-1 pr-2 font-medium">Plate</th>
                      <th className="py-1 pr-2 text-center font-medium">Level</th>
                      <th className="py-1 pr-2 font-medium">Violation</th>
                      <th className="py-1 pr-2 font-medium">BASIC</th>
                      <th className="py-1 pr-2 text-center font-medium" title="Out of service">
                        OOS
                      </th>
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
                              {v.description ?? v.code}
                            </td>
                            <td className={cell}>{v.basic}</td>
                            <td
                              className={`py-1 pr-2 text-center align-top text-xs ${v.out_of_service ? 'font-semibold text-red-700' : 'text-slate-400'}`}
                            >
                              {v.out_of_service ? 'Yes' : '—'}
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
            {inspections.length > maxInspections && (
              <p className="text-xs text-slate-500">
                +{inspections.length - maxInspections} more inspections with violations on the
                Safety tab in CarrierSafetyScan.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Severity and time weights are FMCSA’s; an out-of-service violation (red) adds 2 to its
              severity weight.
            </p>
          </div>

          {crashes.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeading aside="FMCSA Crash File · 24 months">Crashes</SectionHeading>
              <ul className="space-y-0.5 text-sm text-slate-700">
                {crashes.slice(0, 6).map((c) => (
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
            </div>
          )}
        </>
      )}
    </>
  )
}
