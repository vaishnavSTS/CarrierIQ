import { CircleHelp, ShieldHalf } from 'lucide-react'

/** 49 CFR 387.9 (for-hire carriers of property, 10,001 lbs or more) and 387.33 (passengers). */
const MINIMUMS = [
  {
    label: 'General freight',
    amount: 750_000,
    detail: 'Non-hazardous property, vehicles of 10,001 lbs or more',
  },
  {
    label: 'Oil & hazmat',
    amount: 1_000_000,
    detail: 'Oil, hazardous waste and other listed hazardous materials',
  },
  {
    label: 'Bulk hazmat & explosives',
    amount: 5_000_000,
    detail: 'Certain hazardous substances in bulk, and certain explosives and radioactive loads',
  },
  {
    label: 'Passengers, 15 or fewer',
    amount: 1_500_000,
    detail: 'Seating for 15 or fewer passengers, including the driver',
  },
  {
    label: 'Passengers, 16 or more',
    amount: 5_000_000,
    detail: 'Seating for 16 or more passengers, including the driver',
  },
] as const

/** What FMCSA's public record does not tell an agent, each stated on the carrier tabs too. */
const NOT_IN_RECORD = [
  {
    title: 'When the policy expires',
    text: 'An FMCSA filing stays in force until the insurer files a cancellation. The policy’s own dates are on the certificate of insurance.',
  },
  {
    title: 'The renewal date',
    text: 'FMCSA publishes none. The expected renewal on the Authority & Insurance tab is an estimate from past filing dates.',
  },
  {
    title: 'Who was at fault in a crash',
    text: 'FMCSA’s Crash File does not record fault.',
  },
  {
    title: 'FMCSA’s official ISS',
    text: 'The Estimated ISS is Carrier Safety Scan’s estimate by FMCSA’s published method, not FMCSA’s score.',
  },
]

/** Agent home: the federal liability minimums, beside what the public record can't answer. */
export function LiabilityMinimums() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
            <ShieldHalf className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-label text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
              Quick reference
            </p>
            <h2 className="text-lg font-semibold text-slate-950">Federal liability minimums</h2>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-slate-200">
          {MINIMUMS.map((m) => (
            <li key={m.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{m.label}</span>
                <span className="block text-xs text-slate-500">{m.detail}</span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-950">
                ${m.amount.toLocaleString('en-US')}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Minimum liability (BI&PD) for for-hire carriers in interstate commerce, 49 CFR 387.9
          (property) and 387.33 (passengers). The Authority & Insurance tab shows what FMCSA
          requires of the carrier’s own authority next to what is on file.
        </p>
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-300 text-[#060d24]">
            <CircleHelp className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-label text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
              Good to know
            </p>
            <h2 className="text-lg font-semibold text-slate-950">Not in FMCSA’s public record</h2>
          </div>
        </div>
        <dl className="mt-4 space-y-3">
          {NOT_IN_RECORD.map((n) => (
            <div key={n.title}>
              <dt className="text-sm font-medium text-slate-900">{n.title}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{n.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
