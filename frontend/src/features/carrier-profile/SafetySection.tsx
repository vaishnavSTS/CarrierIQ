import { SourceTag } from '../../components/SourceTag'
import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import type { Safety } from '../../types/carrierProfile'
import { formatDate, formatPercent } from '../../utils/format'
import { CrashList } from './safety/CrashList'
import { CsaBasics } from './safety/CsaBasics'
import { EstimatedIssCard } from './safety/EstimatedIssCard'
import { ImprovementGuide } from './safety/ImprovementGuide'
import { ISS_BAND } from './safety/issBand'
import { InspectionHistory } from './safety/InspectionHistory'
import { SafetyTrends } from './safety/SafetyTrends'
import { ViolationBreakdown } from './safety/ViolationBreakdown'
import { Empty, Section, Stat } from './Section'

function SubHeading({ children, source }: { children: string; source?: string }) {
  return (
    <h3 className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
      <span className="font-medium uppercase tracking-wide text-slate-500">{children}</span>
      {source && <SourceTag>{source}</SourceTag>}
    </h3>
  )
}

export function SafetySection({ usdotNumber, safety }: { usdotNumber: number; safety: Safety }) {
  const detail = useCarrierSafety(usdotNumber)
  // FMCSA's method: a Level III (driver-only) inspection does not count toward the vehicle rate.
  const recent = safety.recent
  const crashes = detail.data?.crashes ?? null
  const iss = detail.data?.estimated_iss ?? null
  const issBand = iss?.band ? ISS_BAND[iss.band] : null

  return (
    <Section
      id="safety"
      title="Safety"
      source="FMCSA inspections, SMS, Crash File and Company Census"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Inspections"
          value={safety.inspection_count}
          note={
            safety.first_inspection_date
              ? `${formatDate(safety.first_inspection_date)} – ${formatDate(safety.last_inspection_date)}`
              : 'None in FMCSA’s current window'
          }
          source="FMCSA Vehicle Inspection File"
        />
        <Stat
          label={`Vehicle OOS · last ${recent?.months ?? 24} months`}
          value={formatPercent(recent?.vehicle_oos_rate ?? null)}
          note={
            recent
              ? `${recent.vehicle_oos} of ${recent.vehicle_inspections} inspections that examined the vehicle · national average ${formatPercent(recent.national_vehicle_oos_rate)}`
              : undefined
          }
          source="FMCSA inspections; national average from FMCSA SAFER"
        />
        <Stat
          label={`Driver OOS · last ${recent?.months ?? 24} months`}
          value={formatPercent(recent?.driver_oos_rate ?? null)}
          note={
            recent
              ? `${recent.driver_oos} of ${recent.driver_inspections} inspections that examined the driver · national average ${formatPercent(recent.national_driver_oos_rate)}`
              : undefined
          }
          source="FMCSA inspections; national average from FMCSA SAFER"
        />
        <Stat
          label={`Crashes · last ${crashes?.recent_months ?? 24} months`}
          value={crashes ? crashes.recent_total : '—'}
          note={
            crashes
              ? `${crashes.recent_fatal} fatal · ${crashes.recent_injury} with injury`
              : 'Loading FMCSA crash reports…'
          }
          source="FMCSA Crash File"
        />
        <Stat
          label="Estimated ISS – Safety score"
          value={
            iss?.value != null && issBand ? (
              <span className="flex flex-wrap items-center gap-2">
                {iss.value}
                <StatusBadge label={issBand.status} tone={issBand.tone} />
              </span>
            ) : (
              <span className="text-sm font-normal text-slate-500">
                {detail.data ? 'Not enough data' : 'Loading…'}
              </span>
            )
          }
          note={
            issBand ? `${issBand.range} of 1–100 · lower is better` : 'FMCSA inspection priority'
          }
          source="CarrierIQ estimate (FMCSA methods), not FMCSA’s rating"
        />
      </div>

      {detail.data && (
        <>
          <SubHeading source="CarrierIQ estimate · FMCSA ISS-CSA and SMS methods · FMCSA SMS national file (monthly)">
            Estimated ISS – Safety score
          </SubHeading>
          <EstimatedIssCard iss={detail.data.estimated_iss} />
          <SubHeading
            source={
              detail.data.sms?.dataset
                ? `FMCSA Safety Measurement System · ${detail.data.sms.dataset} (monthly)`
                : 'FMCSA Safety Measurement System'
            }
          >
            CSA BASICs
          </SubHeading>
          <CsaBasics sms={detail.data.sms} />
          <SubHeading source="FMCSA SMS Input – Violation (FMCSA's weights); FMCSA rules (49 CFR)">
            Why the figures look this way · how to improve
          </SubHeading>
          <ImprovementGuide
            drivers={detail.data.drivers}
            recent={safety.recent}
            rating={safety.safety_rating}
            ratingDate={safety.safety_rating_date}
          />
          <SubHeading source="FMCSA Crash File (state crash reports)">Crashes</SubHeading>
          <CrashList crashes={detail.data.crashes} />
        </>
      )}

      {safety.inspection_count === 0 ? (
        <div className="mt-4">
          <Empty>
            No inspections in FMCSA’s current inspection file (roughly the last three years).
          </Empty>
        </div>
      ) : (
        <>
          {detail.error && (
            <p className="mt-6 text-sm text-red-700">
              Could not load safety trends: {detail.error.message}
            </p>
          )}
          {detail.isPending && <p className="mt-6 text-sm text-slate-500">Loading trends…</p>}
          {detail.data && (
            <>
              <SubHeading source="FMCSA Vehicle Inspection File">Trends</SubHeading>
              <SafetyTrends quarters={detail.data.quarters} />
              <SubHeading source="FMCSA Inspections and Violations File">Violations</SubHeading>
              <ViolationBreakdown summary={detail.data.violations} />
            </>
          )}
          <SubHeading source="FMCSA Vehicle Inspection File">Inspection history</SubHeading>
          <InspectionHistory usdotNumber={usdotNumber} />
        </>
      )}
    </Section>
  )
}
