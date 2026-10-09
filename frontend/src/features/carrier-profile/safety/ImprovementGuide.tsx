import type { OosWindow } from '../../../types/carrierProfile'
import type { BasicDriver } from '../../../types/carrierSafety'
import { formatDate, formatPercent } from '../../../utils/format'
import { BASIC_TIPS, DATAQS_URL, groupTip } from './improvementTips'

const TOP_BASICS = 3
const TOP_GROUPS = 3

/**
 * Two sentences: which violations weigh most in the CSA measures (FMCSA's own weights), and what
 * reducing them would change. It says the measures, not the rating: a rating changes only after
 * an FMCSA review.
 */
function improvementSummary(
  drivers: BasicDriver[] | null,
  recent: OosWindow | null,
): string | null {
  if (drivers === null) return null
  if (drivers.length === 0) {
    return 'FMCSA counts no violations against this carrier in the current 24-month period. Keeping inspections free of violations keeps the CSA measures low; the safety rating itself changes only after an FMCSA review.'
  }
  const picks = drivers
    .flatMap((b) => b.groups.slice(0, 2).map((g) => ({ basic: b.basic, group: g })))
    .sort((a, b) => b.group.weight - a.group.weight)
  // The heaviest group of the heaviest BASIC, then the heaviest from another BASIC if any.
  const first = { basic: drivers[0].basic, group: drivers[0].groups[0] }
  const second =
    picks.find((p) => p.basic !== first.basic) ?? picks.find((p) => p.group !== first.group)
  const named = [first, second]
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.group))
    .map((p) => `${p.group.group.toLowerCase()} (${formatPercent(p.group.share)} of ${p.basic})`)
  const oos =
    recent &&
    recent.vehicle_oos_rate !== null &&
    recent.vehicle_oos_rate > recent.national_vehicle_oos_rate
      ? `, and bring the vehicle out-of-service rate (${formatPercent(recent.vehicle_oos_rate)}) closer to FMCSA’s national average (${formatPercent(recent.national_vehicle_oos_rate)})`
      : ''
  return (
    `According to FMCSA’s records, the most weight in this carrier’s CSA measures comes from ${named.join(' and ')} violations. ` +
    `Fewer of these, and more inspections with no violations, would lower those measures the most${oos}; the safety rating itself changes only after an FMCSA review.`
  )
}

function RatingNote({ rating, date }: { rating: string | null; date: string | null }) {
  if (!rating) {
    return (
      <>
        FMCSA has not rated this carrier. A safety rating comes only from an FMCSA investigation (a
        compliance review); “Not rated” is not a low rating. The day-to-day picture brokers see
        comes from the CSA measures and out-of-service rates below.
      </>
    )
  }
  const since = date ? ` (since ${formatDate(date)})` : ''
  if (rating === 'SATISFACTORY') {
    return (
      <>
        FMCSA rated the carrier Satisfactory{since}. The rating changes only after a new FMCSA
        investigation; the CSA measures below change every month.
      </>
    )
  }
  return (
    <>
      FMCSA rated the carrier {rating.toLowerCase()}
      {since}. A carrier can ask FMCSA to upgrade the rating after correcting the problems found (49
      CFR 385.17), or ask for an administrative review if it believes the rating is wrong (385.15).
    </>
  )
}

/**
 * Why a carrier's safety figures look the way they do, and what usually helps. The "why" is
 * FMCSA's own data: the violations FMCSA counts in each CSA measure, with FMCSA's weights. The
 * suggestions are common practice and the rule behind it, never a promise of a result.
 */
export function ImprovementGuide({
  drivers,
  recent,
  rating,
  ratingDate,
}: {
  drivers: BasicDriver[] | null
  recent: OosWindow | null
  rating: string | null
  ratingDate: string | null
}) {
  const summary = improvementSummary(drivers, recent)
  const oos = recent
    ? [
        ['vehicle', recent.vehicle_oos_rate, recent.national_vehicle_oos_rate] as const,
        ['driver', recent.driver_oos_rate, recent.national_driver_oos_rate] as const,
      ].filter(([, rate, national]) => rate !== null && rate > national)
    : []

  return (
    <div className="space-y-5 text-sm text-slate-700">
      {summary && (
        <p className="break-inside-avoid rounded-md border-l-4 border-accent bg-accent/10 px-3 py-2 font-medium text-slate-900">
          {summary}
        </p>
      )}
      <div>
        <h4 className="font-semibold text-slate-900">Safety rating</h4>
        <p className="mt-1">
          <RatingNote rating={rating} date={ratingDate} />
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-slate-900">What drives the CSA measures</h4>
        {drivers === null ? (
          <p className="mt-1 text-slate-500">
            FMCSA’s violation data has not been fetched yet; use Refresh now.
          </p>
        ) : drivers.length === 0 ? (
          <p className="mt-1">
            FMCSA counts no violations against this carrier in the current 24-month period.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {drivers.slice(0, TOP_BASICS).map((b) => (
              <li
                key={b.basic}
                className="break-inside-avoid rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900">{b.basic}</span>
                  <span className="text-xs text-slate-500">
                    {b.violations} violation{b.violations === 1 ? '' : 's'}
                    {b.out_of_service > 0 && ` · ${b.out_of_service} out of service`} ·{' '}
                    {b.recent_violations} in the last 6 months · FMCSA weight {b.weight}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {b.groups.slice(0, TOP_GROUPS).map((g) => {
                    const tip = groupTip(g.group)
                    return (
                      <li key={g.group}>
                        <span className="font-medium text-slate-900">{g.group}</span>:{' '}
                        {g.violations} violation{g.violations === 1 ? '' : 's'},{' '}
                        {formatPercent(g.share)} of the {b.basic} weight
                        {g.examples[0] && (
                          <span className="text-slate-500"> (e.g. {g.examples[0]})</span>
                        )}
                        {tip && (
                          <span className="block text-xs text-slate-500">Usually helps: {tip}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {BASIC_TIPS[b.basic] && (
                  <p className="mt-1.5 text-xs text-slate-600">
                    <span className="font-medium">For {b.basic} overall:</span>{' '}
                    {BASIC_TIPS[b.basic]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {oos.length > 0 && recent && (
        <div>
          <h4 className="font-semibold text-slate-900">Out-of-service rates</h4>
          <p className="mt-1">
            {oos
              .map(
                ([unit, rate, national]) =>
                  `The ${unit} out-of-service rate is ${formatPercent(rate)} over the last ${recent.months} months, against FMCSA’s national average of ${formatPercent(national)}.`,
              )
              .join(' ')}{' '}
            Out-of-service violations also carry extra weight in the CSA measures, so the violation
            groups above with out-of-service counts are usually the first to address.
          </p>
        </div>
      )}

      <div>
        <h4 className="font-semibold text-slate-900">How FMCSA counts it</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Each violation has a severity weight from 1 to 10, plus 2 when it put a vehicle or
            driver out of service.
          </li>
          <li>
            Newer violations weigh more: ×3 in the last 6 months, ×2 for 6–12 months, ×1 for 12–24
            months. After 24 months a violation no longer counts.
          </li>
          <li>
            Inspections with no violations also count, and lower the measures: clean inspections
            help as much as fewer violations.
          </li>
          <li>
            An inspection or violation that is wrong can be challenged through FMCSA’s DataQs system
            ({DATAQS_URL}); FMCSA corrects or removes it if the challenge succeeds.
          </li>
        </ul>
      </div>
    </div>
  )
}
