import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const BANDS = [
  ['1–49', 'Pass', 'Satisfactory'],
  ['50–74', 'Optional', 'At risk'],
  ['75–100', 'Inspect', 'High risk'],
]

const THRESHOLDS = [
  ['Unsafe Driving, HOS Compliance, Crash Indicator', '65%'],
  ['Vehicle Maintenance, Driver Fitness, Controlled Substances/Alcohol', '80%'],
]

const SOURCES = [
  {
    name: 'FMCSA, ISS-CSA Algorithm Description (December 2012, Appendix A)',
    href: 'https://ai.fmcsa.dot.gov/sms/helpfiles/iss_algorithm.pdf',
  },
  {
    name: 'FMCSA, SMS Methodology (version 3.21, May 2026)',
    href: 'https://csa.fmcsa.dot.gov/documents/smsmethodology.pdf',
  },
  {
    name: 'FMCSA SMS AB PassProperty (monthly)',
    href: 'https://data.transportation.gov/d/4y6x-dmck',
  },
  {
    name: 'FMCSA SMS Input – Crash (monthly)',
    href: 'https://data.transportation.gov/d/4wxs-vbns',
  },
  {
    name: 'FMCSA SMS Input – Motor Carrier Census',
    href: 'https://data.transportation.gov/d/kjg3-diqy',
  },
  { name: 'FMCSA Company Census', href: 'https://data.transportation.gov/d/az4n-8mr2' },
  { name: 'FMCSA out-of-service orders', href: 'https://data.transportation.gov/d/p2mt-9ige' },
]

const WORDS = [
  ['BASIC', 'FMCSA’s name for a safety category, such as Unsafe Driving or Vehicle Maintenance.'],
  ['Percentile', 'How a carrier ranks against similar carriers. 0 is best and 100 is worst.'],
  ['Threshold', 'The percentile at which FMCSA may step in.'],
  ['Measure', 'Violation points divided by inspections, or by fleet size and miles.'],
  ['Severity', 'How serious FMCSA rates a violation, from 1 to 10. Out of service adds 2.'],
  ['Time weight', 'How much a violation counts for its age: 3× for 6 months, 2× to 12, 1× to 24.'],
  ['Out of service', 'FMCSA’s inspector stopped the truck or driver until the problem was fixed.'],
  ['MCS-150', 'The company update form every carrier files with FMCSA.'],
  ['BOC-3', 'The filing that names a carrier’s process agents, who accept legal papers for it.'],
  ['BI&PD', 'Liability insurance for injuries and property damage.'],
  ['SMS', 'FMCSA’s Safety Measurement System, where most of the safety data comes from.'],
  ['DataQs', 'FMCSA’s system for challenging a wrong inspection or violation.'],
]

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

const CELL = 'border-t border-slate-200 px-3 py-2 align-top'
const HEAD = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500'

/** How the Estimated ISS is worked out, in public, from docs/estimated-iss-v1.md. */
export function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 md:py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
          How the Estimated ISS works
        </h1>
        <p className="mt-3 text-slate-700">
          FMCSA’s Inspection Selection System (ISS) gives each carrier a value from 1 to 100 that
          roadside inspectors use to decide who to inspect. FMCSA doesn’t publish these values, or
          property carriers’ safety percentiles, so CarrierSafetyScan recomputes them from FMCSA’s
          public data using FMCSA’s published methods.
        </p>
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          It is an estimate. It isn’t FMCSA’s official ISS, and it isn’t a safety rating.
          CarrierSafetyScan and Sky Transport Solutions aren’t part of FMCSA.
        </p>
      </div>

      <Block title="What the number means">
        <p>Lower is better. An active out-of-service order means 100.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={HEAD}>Value</th>
                <th className={HEAD}>FMCSA’s recommendation</th>
                <th className={HEAD}>Our wording</th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map(([value, fmcsa, ours]) => (
                <tr key={value}>
                  <td className={`${CELL} tabular-nums`}>{value}</td>
                  <td className={CELL}>{fmcsa}</td>
                  <td className={CELL}>{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="How it is worked out">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="font-medium text-slate-900">Safety percentiles.</span> In each safety
            category (BASIC), a carrier is ranked against carriers with a similar amount of data. 0
            is best and 100 is worst. A carrier gets a percentile only with FMCSA’s minimum number
            of inspections with violations in that category, or crashes for the Crash Indicator.
          </li>
          <li>
            <span className="font-medium text-slate-900">Thresholds.</span> Each percentile is
            compared with FMCSA’s intervention threshold for general carriers (below).
          </li>
          <li>
            <span className="font-medium text-slate-900">ISS group.</span> Which categories are
            over, and how many, place the carrier in one of FMCSA’s 13 groups, and the group sets
            the band: Inspect, Optional or Pass.
          </li>
          <li>
            <span className="font-medium text-slate-900">Value inside the band.</span> Carriers are
            ordered by group, then by the sum of their percentiles, and spread evenly across the
            band. Carriers with the same sum get the same value.
          </li>
          <li>
            <span className="font-medium text-slate-900">Too few inspections.</span> With fewer than
            3 driver and 5 vehicle inspections in 24 months, FMCSA’s insufficient-data rules apply
            instead. They use the inspections there are, the inspection rate, or the fleet size.
          </li>
        </ol>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={HEAD}>Safety category</th>
                <th className={HEAD}>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map(([basics, threshold]) => (
                <tr key={basics}>
                  <td className={CELL}>{basics}</td>
                  <td className={`${CELL} tabular-nums`}>{threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="Words used">
        <dl className="space-y-2">
          {WORDS.map(([word, meaning]) => (
            <div key={word}>
              <dt className="inline font-medium text-slate-900">{word}: </dt>
              <dd className="inline">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title="How close it is">
        <p>
          In October 2026 we compared the estimate with 22 real ISS values. Of the 15 carriers with
          enough data, all 15 fell in the right band and 12 were within 5 points. The 7 carriers
          without enough data were all within 5 points. That is a small sample, so a single
          carrier’s estimate can still differ from FMCSA’s value.
        </p>
      </Block>

      <Block title="What it can’t see">
        <ul className="list-disc space-y-2 pl-5">
          <li>FMCSA’s current ISS may differ from the 2012 description we follow.</li>
          <li>
            Passenger and hazardous-material thresholds and the HM Compliance category aren’t
            applied.
          </li>
          <li>Results of FMCSA investigations (ISS group 6) aren’t public.</li>
          <li>
            A carrier whose fleet changed recently may be ranked with a different peer group from
            FMCSA’s, because the fleet comes from the current census.
          </li>
          <li>FMCSA’s random selection of 1% of carriers at 99 can’t be predicted.</li>
        </ul>
      </Block>

      <Block title="Sources">
        <ul className="space-y-2">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent-strong hover:underline"
              >
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </Block>

      <p className="text-sm text-slate-700">
        Questions about a number?{' '}
        <Link to="/contact" className="font-medium text-accent-strong hover:underline">
          Talk to a Sky Transport Solutions specialist
        </Link>
        .
      </p>
    </div>
  )
}
