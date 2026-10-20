import { SourceTag } from '../../components/SourceTag'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import type { Safety } from '../../types/carrierProfile'
import { formatDate, humanize } from '../../utils/format'
import { CrashList } from './safety/CrashList'
import { CsaBasics } from './safety/CsaBasics'
import { EstimatedIssCard } from './safety/EstimatedIssCard'
import { ImprovementGuide } from './safety/ImprovementGuide'
import { InspectionCounts } from './safety/InspectionCounts'
import { InspectionHistory } from './safety/InspectionHistory'
import { OosTable } from './safety/OosTable'
import { PullInCard } from './safety/PullInCard'
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

export function SafetySection({
  usdotNumber,
  safety,
  homeState = null,
}: {
  usdotNumber: number
  safety: Safety
  /** The carrier's physical-address state, to mark it in the pull-in rates */
  homeState?: string | null
}) {
  const detail = useCarrierSafety(usdotNumber)
  const recent = safety.recent
  const months = recent?.months ?? 24
  const crashes = detail.data?.crashes ?? null
  // Everything CarrierSafetyScan has loaded, which reaches further back than the 24-month window.
  const loaded = safety.first_inspection_date
    ? `${formatDate(safety.first_inspection_date)} – ${formatDate(safety.last_inspection_date)}`
    : null

  return (
    <Section
      id="safety"
      title="Safety"
      source="FMCSA inspections, SMS, Crash File and Company Census"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="FMCSA safety rating"
          value={safety.safety_rating ? humanize(safety.safety_rating.toLowerCase()) : 'Not rated'}
          note={
            safety.safety_rating_date
              ? `Rated ${formatDate(safety.safety_rating_date)}`
              : 'FMCSA rates a carrier only after a compliance review'
          }
          source="FMCSA Company Census"
        />
        <Stat
          label={`Inspections · last ${months} months`}
          value={recent?.inspections ?? 0}
          note={
            loaded
              ? `${safety.inspection_count} in all loaded records (${loaded})`
              : 'No inspections in the loaded records'
          }
          source="FMCSA Vehicle Inspection File"
        />
        <Stat
          label={`Crashes · last ${crashes?.recent_months ?? 24} months`}
          value={crashes ? crashes.recent_total : '—'}
          note={
            crashes
              ? `${crashes.recent_fatal} with a fatality · ${crashes.recent_injury} with an injury`
              : detail.data
                ? 'Not loaded yet'
                : 'Loading FMCSA crash reports…'
          }
          source="FMCSA Crash File"
        />
      </div>

      <SubHeading source="FMCSA inspections; national averages from FMCSA SAFER">
        Out-of-service rates
      </SubHeading>
      <OosTable recent={recent} />

      {detail.data && (
        <>
          <div className="mt-8">
            <EstimatedIssCard
              iss={detail.data.estimated_iss}
              history={detail.data.iss_history ?? []}
            />
          </div>
          <SubHeading source="PrePass state pull-in rates (shared by STS)">
            Weigh-station pull-in chance by state
          </SubHeading>
          <PullInCard
            pullIn={detail.data.pull_in}
            byState={detail.data.by_state}
            homeState={homeState}
          />
          <SubHeading
            source={
              detail.data.sms?.dataset
                ? `FMCSA Safety Measurement System · ${detail.data.sms.dataset} (monthly)`
                : 'FMCSA Safety Measurement System'
            }
          >
            CSA safety categories (BASICs)
          </SubHeading>
          <CsaBasics sms={detail.data.sms} />
          <SubHeading source="FMCSA SMS Input – Violation (FMCSA's weights); FMCSA rules (49 CFR)">
            What drives these numbers · how to improve
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
          <Empty>No roadside inspections in the loaded records (about the last three years).</Empty>
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
              <SubHeading source="FMCSA Vehicle Inspection File">
                {`Trends · by quarter${loaded ? ` (${loaded})` : ''}`}
              </SubHeading>
              <SafetyTrends quarters={detail.data.quarters} />
              <SubHeading source="FMCSA Inspections and Violations File">
                {`Violations · all loaded inspections${loaded ? ` (${loaded})` : ''}`}
              </SubHeading>
              <ViolationBreakdown summary={detail.data.violations} />
              <SubHeading>Where and how the carrier was inspected</SubHeading>
              <InspectionCounts byLevel={detail.data.by_level} byState={detail.data.by_state} />
            </>
          )}
          <SubHeading source="FMCSA Vehicle Inspection File">Inspection history</SubHeading>
          <InspectionHistory usdotNumber={usdotNumber} />
        </>
      )}
    </Section>
  )
}
