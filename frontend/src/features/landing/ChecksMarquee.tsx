import { CircleCheck } from 'lucide-react'

/** What a carrier's page in Carrier Safety Scan covers (every one is a real part of the app). */
const CHECKS = [
  'Operating authority',
  'Liability & cargo insurance',
  'BOC-3 process agent',
  'MCS-150 update',
  'Estimated ISS safety score',
  'CSA safety categories',
  'Out-of-service rates',
  'Every inspection & violation',
  'Crashes, last 24 months',
  'Trucks & trailers by VIN',
  'Shared phones, emails & addresses',
  'Chameleon check',
  'DataQs challenges',
  'Safety Score Report',
]

/**
 * A strip under the hero with what gets checked, scrolling slowly sideways (paused on hover;
 * still, and wrapping, for people who prefer reduced motion).
 */
export function ChecksMarquee() {
  const row = (hidden: boolean) => (
    <ul
      className="marquee-row flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {CHECKS.map((check) => (
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
