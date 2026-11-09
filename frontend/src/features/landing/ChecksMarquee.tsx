import { CircleCheck } from 'lucide-react'

import type { Audience } from '../audience/audience'

/**
 * What each audience's portal covers, in the order that audience cares about (every one is a real
 * part of the app). DataQs is a carrier service only.
 */
const CHECKS: Record<Audience, string[]> = {
  carrier: [
    'What a broker’s check flags',
    'MCS-150 update due date',
    'Estimated ISS safety score',
    'CSA safety categories',
    'Every inspection & violation',
    'Violations that weigh most',
    'Operating authority',
    'Liability & cargo insurance',
    'BOC-3 process agent',
    'Shared phones, emails & addresses',
    'DataQs challenges',
    'Compliance filings by STS',
    'Safety Score Report',
  ],
  broker: [
    'Booking check on every carrier',
    'Operating authority',
    'Liability vs the legal minimum',
    'Out-of-service orders',
    'New-authority red flags',
    'Shared phones, emails & addresses',
    'Chameleon check',
    'VINs under other USDOTs',
    'Crashes, last 24 months',
    'Estimated ISS safety score',
    'Compare up to 3 carriers',
    'Dated Safety Score Report',
  ],
  agent: [
    'Liability, cargo & bond filings',
    'Expected renewal month',
    'Authority age & history',
    'Crashes, last 24 months',
    'Out-of-service rates vs national',
    'CSA safety categories',
    'Estimated ISS safety score',
    'Trucks & trailers by VIN',
    'Fleet size vs inspections',
    'Linked carriers',
    'Dated report for the file',
  ],
}

/**
 * A strip under the hero with what gets checked, scrolling slowly sideways, without stopping
 * (still, and wrapping, for people who prefer reduced motion).
 */
export function ChecksMarquee({ audience }: { audience: Audience }) {
  const checks = CHECKS[audience]
  const row = (hidden: boolean) => (
    <ul
      className="marquee-row flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {checks.map((check) => (
        <li
          key={check}
          className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-700"
        >
          <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
          {check}
        </li>
      ))}
    </ul>
  )
  return (
    <section
      aria-label="What Carrier Safety Scan checks"
      className="marquee relative overflow-hidden border-y border-slate-200 bg-surface py-4"
    >
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </section>
  )
}
