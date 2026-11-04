import type { InspectionDetail } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { levelLabel } from '../safety/inspectionLevels'
import { violationText } from './recordDetail'
import { ScrollX } from './ScrollX'
import { SectionHeading } from './SectionHeading'

const month = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })

/** FMCSA's location often already ends with the state ("MARSING ID"), or is only the state. */
function where(i: InspectionDetail): string {
  const location = i.location?.trim()
  if (location && i.state && (location === i.state || location.endsWith(` ${i.state}`))) {
    return location
  }
  return [location, i.state].filter(Boolean).join(', ') || '—'
}

function outOfService(i: InspectionDetail): string {
  if (i.vehicle_oos && i.driver_oos) return 'Vehicle and driver'
  if (i.vehicle_oos) return 'Vehicle'
  if (i.driver_oos) return 'Driver'
  return 'No'
}

/**
 * The end of the Safety Score Report: the carrier's latest inspections, one by one, newest first,
 * with each violation FMCSA recorded (all of them are on the Inspections tab). In print it runs
 * over as many pages as it needs, split between inspections (printFit.ts).
 */
export function InspectionList({
  inspections,
  total,
  usdotNumber,
  fullRecordUrl,
}: {
  /** The latest ones, newest first */
  inspections: InspectionDetail[]
  /** How many are on file in all */
  total: number
  usdotNumber: number
  /** The carrier's page in the app, where every inspection is listed */
  fullRecordUrl: string
}) {
  const newest = inspections[0]?.inspection_date
  const oldest = inspections[inspections.length - 1]?.inspection_date
  const withViolations = inspections.filter((i) => i.violation_count > 0).length
  const stopped = inspections.filter((i) => i.vehicle_oos || i.driver_oos).length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <div className="space-y-2">
      <SectionHeading
        aside={`FMCSA inspection file${newest && oldest ? ` · ${month(oldest)} to ${month(newest)}` : ''}`}
      >
        {total > inspections.length ? `Latest ${inspections.length} inspections` : 'Inspections'}
      </SectionHeading>
      <p className="text-sm text-slate-700">
        {total > inspections.length
          ? `The latest ${inspections.length} of the ${total} inspections`
          : `All ${plural(inspections.length, 'inspection')}`}{' '}
        CarrierSafetyScan has from FMCSA’s inspection file for USDOT {usdotNumber}, newest first:{' '}
        {withViolations} with violations, {inspections.length - withViolations} without, and{' '}
        {stopped} where a driver or vehicle was placed out of service. Each violation is listed
        under its inspection; out-of-service ones are in red. A description ending in “…” is cut off
        in FMCSA’s own file.
        {total > inspections.length &&
          ` All ${total} are on the Inspections tab after logging in: ${fullRecordUrl}`}
      </p>
      <ScrollX>
        {/* Split between inspections when it runs past a printed page (printFit.ts). */}
        <table data-split data-inspection-list className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Where</th>
              <th className="py-1.5 pr-3 font-medium">Report number</th>
              <th className="py-1.5 pr-3 font-medium">Level</th>
              <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Out of service</th>
              <th className="py-1.5 text-right font-medium">Violations</th>
            </tr>
          </thead>
          {inspections.map((i) => {
            const stoppedHere = i.vehicle_oos || i.driver_oos
            return (
              <tbody
                key={i.inspection_id}
                className="break-inside-avoid border-b border-slate-200 align-top text-slate-700"
              >
                <tr>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-semibold tabular-nums text-slate-900">
                    {formatDate(i.inspection_date)}
                  </td>
                  <td className="py-1.5 pr-3">{where(i)}</td>
                  <td className="py-1.5 pr-3 font-mono text-[13px]">{i.report_number ?? '—'}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{levelLabel(i.level)}</td>
                  <td
                    className={`whitespace-nowrap py-1.5 pr-3 ${stoppedHere ? 'font-semibold text-red-700' : 'text-slate-500'}`}
                  >
                    {outOfService(i)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{i.violation_count}</td>
                </tr>
                {/* Its violations, one per line; a clean inspection's 0 says it all. */}
                {(i.violations.length > 0 || i.violation_count > 0) && (
                  <tr>
                    <td colSpan={6} className="pb-2 pl-4">
                      {i.violations.length === 0 ? (
                        <span className="text-slate-500">
                          {`${plural(i.violation_count, 'violation')} on the report; FMCSA’s file has no details for ${i.violation_count === 1 ? 'it' : 'them'}.`}
                        </span>
                      ) : (
                        <ul className="space-y-0.5">
                          {i.violations.map((v, n) => (
                            <li
                              key={`${v.code}-${n}`}
                              className={`flex gap-3 ${v.out_of_service ? 'font-semibold text-red-700' : ''}`}
                            >
                              <span className="w-16 shrink-0 text-slate-500">
                                {v.applies_to === 'DRIVER'
                                  ? 'Driver'
                                  : v.unit_number
                                    ? `Unit ${v.unit_number}`
                                    : 'Vehicle'}
                              </span>
                              <span className="min-w-0 flex-1">
                                {violationText(v.description, v.code ?? 'Not described')}
                                {v.code && (
                                  <span className="font-mono text-[12px] font-normal text-slate-500">
                                    {' '}
                                    {v.code}
                                  </span>
                                )}
                                {v.out_of_service && ' · Out of service'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            )
          })}
        </table>
      </ScrollX>
    </div>
  )
}
