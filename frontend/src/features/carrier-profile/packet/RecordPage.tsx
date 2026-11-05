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

/** Caps that keep the record short; the rest is in the app. */
const MAX_STEPS = 6
const MAX_CRASHES = 6
const MAX_CODES = 10

const day = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

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
  fullRecordUrl,
}: {
  safety: CarrierSafety
  client: boolean
  whose: string
  /** This carrier's page in the app, for what a printed page can't list */
  fullRecordUrl: string
}) {
  const maxCodes = MAX_CODES
  const inspections = safety.sms_inspections ?? []
  const steps = improvementSteps(inspections).slice(0, MAX_STEPS)
  const codes = violationRows(inspections)
  const heaviest = heaviestViolations(inspections)
  const crashes = (safety.crashes?.crashes ?? []).filter(
    (c) => new Date(c.report_date) >= new Date(Date.now() - 730 * 24 * 3600 * 1000),
  )

  return (
    <>
      <div className="grid gap-5 wide:grid-cols-[1.15fr_1fr]">
        <div className="space-y-2">
          <SectionHeading tone="green">When {whose} score improves on its own</SectionHeading>
          {steps.length === 0 ? (
            <p className="text-sm text-slate-600">
              No violations in the last 24 months, so nothing is waiting to drop off.
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
            <p className="text-sm text-slate-700">No violations count in the score right now.</p>
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
                  <th className="py-1 pl-3 font-medium">Violation code</th>
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
      {/* Every inspection is listed on the report's last pages (InspectionList). */}
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
  )
}
