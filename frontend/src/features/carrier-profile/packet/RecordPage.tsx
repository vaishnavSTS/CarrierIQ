import { CalendarClock, Scale } from 'lucide-react'
import type { ReactNode } from 'react'

import type { CarrierSafety } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { heaviestViolations, improvementSteps, violationCode, violationRows } from './recordDetail'

/** Caps that keep the record page to about one A4 page. */
const MAX_STEPS = 8
const MAX_CODES = 10
const MAX_INSPECTIONS = 6
const MAX_VIOLATIONS_PER_INSPECTION = 6
const MAX_PULL_IN_STATES = 8

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 text-base font-semibold tracking-tight text-slate-900">
      {children}
      {aside && <span className="text-xs font-normal text-slate-500">{aside}</span>}
    </h2>
  )
}

const day = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const points = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1))

/**
 * Page 4 of the Safety Score Report: FMCSA's SMS record line by line (as on FMCSA's own SMS
 * profile), and what CarrierSafetyScan adds: when the score improves on its own, which violations
 * weigh most (worth checking for a DataQs challenge), and weigh-station pull-in rates.
 */
export function RecordPage({
  safety,
  client,
  whose,
}: {
  safety: CarrierSafety
  client: boolean
  whose: string
}) {
  const inspections = safety.sms_inspections ?? []
  const steps = improvementSteps(inspections).slice(0, MAX_STEPS)
  const codes = violationRows(inspections)
  const heaviest = heaviestViolations(inspections)
  const clean = Math.max(0, (safety.sms?.inspections ?? 0) - inspections.length)
  const crashes = (safety.crashes?.crashes ?? []).filter(
    (c) => new Date(c.report_date) >= new Date(Date.now() - 730 * 24 * 3600 * 1000),
  )
  const states = new Set(safety.by_state.slice(0, MAX_PULL_IN_STATES).map((s) => s.key))
  const pullIn = safety.pull_in
  const rates = (pullIn?.rates ?? []).filter((r) => states.has(r.state) && r.percent !== null)

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1.15fr_1fr]">
        <div className="space-y-2">
          <Heading aside="FMCSA time weights: 3× for 6 months, 2× to 12, 1× to 24">
            <span className="flex items-center gap-2">
              <CalendarClock className="size-5 text-emerald-600" aria-hidden />
              When {whose} score improves on its own
            </span>
          </Heading>
          {steps.length === 0 ? (
            <p className="text-sm text-slate-600">
              No violations in FMCSA’s 24-month window, so nothing is waiting to drop off.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Inspection</th>
                  <th className="py-1 font-medium">What happens</th>
                  <th className="py-1 text-right font-medium">Weight</th>
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
                      −{points(s.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="break-inside-avoid space-y-2 rounded-xl border-2 border-accent bg-accent-soft px-4 py-3">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Scale className="size-5 text-accent-strong" aria-hidden />
            Heaviest violations: check these first
          </div>
          {heaviest.length === 0 ? (
            <p className="text-sm text-slate-700">No violations count in the score right now.</p>
          ) : (
            <ol className="space-y-1.5 text-sm text-slate-700">
              {heaviest.map(({ violation: v, inspection: i }, n) => (
                <li key={`${i.inspection_id}-${v.code}-${n}`} className="flex gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-strong text-[11px] font-bold text-surface">
                    {n + 1}
                  </span>
                  <span>
                    <span className="font-semibold text-slate-900">{v.description ?? v.code}</span>{' '}
                    <span className="text-xs text-slate-500">
                      ({violationCode(v.code)} · {formatDate(i.inspection_date)}
                      {i.state && ` ${i.state}`} · weight {points(v.total_weight)}
                      {v.out_of_service && ', out of service'})
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-slate-700">
            If one of these is wrong, a DataQs challenge removes its whole weight from the score.
            {client && ' STS files DataQs requests for $50 per inspection.'}
          </p>
        </div>
      </div>

      {codes.length > 0 && (
        <div className="space-y-2">
          <Heading aside={`FMCSA SMS · ${codes.reduce((n, r) => n + r.count, 0)} violations`}>
            Violation summary
          </Heading>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">Code</th>
                <th className="py-1 font-medium">Description</th>
                <th className="py-1 font-medium">BASIC</th>
                <th className="py-1 text-right font-medium">Count</th>
                <th className="py-1 text-right font-medium">OOS</th>
                <th className="py-1 text-right font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top tabular-nums text-slate-700">
              {codes.slice(0, MAX_CODES).map((r) => (
                <tr key={r.code}>
                  <td className="whitespace-nowrap py-1 pr-2 font-mono text-[11px] text-slate-900">
                    {violationCode(r.code)}
                  </td>
                  <td className="py-1 pr-2">
                    {/* One line here: the inspection history below has each one in full. */}
                    <span className="line-clamp-1">{r.description ?? '—'}</span>
                  </td>
                  <td className="py-1 pr-2 text-xs">{r.basic}</td>
                  <td className="py-1 text-right">{r.count}</td>
                  <td
                    className={`py-1 text-right ${r.outOfService > 0 ? 'font-semibold text-red-700' : ''}`}
                  >
                    {r.outOfService}
                  </td>
                  <td className="py-1 text-right">{r.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {codes.length > MAX_CODES && (
            <p className="text-xs text-slate-500">
              +{codes.length - MAX_CODES} more codes on the Safety tab in CarrierSafetyScan.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Heading
          aside={`${inspections.length} with violations · ${clean} without, in FMCSA’s 24 months`}
        >
          Inspection history
        </Heading>
        {inspections.length === 0 ? (
          <p className="text-sm text-slate-600">
            {safety.sms_inspections === null || safety.sms_inspections === undefined
              ? 'FMCSA’s violation file has not been loaded for this carrier yet.'
              : 'No inspection in FMCSA’s 24-month window has a violation.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {inspections.slice(0, MAX_INSPECTIONS).map((i) => (
              <div
                key={i.inspection_id}
                className="break-inside-avoid rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatDate(i.inspection_date)}
                    {i.state && ` · ${i.state}`}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {[
                      i.report_number && `Report ${i.report_number}`,
                      i.plate && `Plate ${i.plate}${i.plate_state ? ` (${i.plate_state})` : ''}`,
                      i.level && `Level ${i.level}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {i.violations.slice(0, MAX_VIOLATIONS_PER_INSPECTION).map((v, n) => (
                    <li
                      key={`${v.code}-${n}`}
                      className={`flex justify-between gap-2 text-xs ${v.out_of_service ? 'font-semibold text-red-700' : 'text-slate-700'}`}
                    >
                      <span>
                        {v.description ?? v.code}
                        <span className="font-normal text-slate-500"> · {v.basic}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                        {v.out_of_service ? `${v.severity_weight}+2 OOS` : `${v.severity_weight}`} ×{' '}
                        {v.time_weight}
                      </span>
                    </li>
                  ))}
                </ul>
                {i.violations.length > MAX_VIOLATIONS_PER_INSPECTION && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    +{i.violations.length - MAX_VIOLATIONS_PER_INSPECTION} lighter violations
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {inspections.length > MAX_INSPECTIONS && (
          <p className="text-xs text-slate-500">
            +{inspections.length - MAX_INSPECTIONS} more inspections with violations on the Safety
            tab in CarrierSafetyScan.
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          Each violation shows FMCSA’s severity weight × time weight; out-of-service violations
          (red) add 2 to the severity.
        </p>
      </div>

      {(crashes.length > 0 || (pullIn && rates.length > 0)) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {crashes.length > 0 && (
            <div className="space-y-1.5">
              <Heading aside="FMCSA Crash File · 24 months">Crashes</Heading>
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
          {pullIn && rates.length > 0 && (
            <div className="space-y-1.5">
              <Heading aside={`At an Estimated ISS of ${pullIn.score}`}>
                Weigh-station pull-in rates
              </Heading>
              <div className="flex flex-wrap gap-1.5">
                {rates.map((r) => (
                  <span
                    key={r.state}
                    className="rounded-md border border-slate-200 px-2 py-0.5 text-sm tabular-nums"
                  >
                    <span className="font-semibold text-slate-900">{r.state}</span>{' '}
                    <span className="text-slate-700">{r.percent}%</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                States where {whose === 'your' ? 'you were' : 'it was'} inspected most; each state
                sets its own rate (PrePass, {formatDate(pullIn.effective_date)}). A lower score
                lowers them.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
