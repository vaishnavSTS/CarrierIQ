import {
  ArrowUpRight,
  ClipboardCheck,
  FileText,
  Gauge,
  Network,
  ShieldCheck,
  Truck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useCarrierPath } from '../../../hooks/usePortalMode'
import { useCompareList } from '../../compare/compareContext'
import { useComparison } from '../../compare/useComparison'
import { CARD, LABEL, useReveal } from './reveal'

interface Check {
  icon: LucideIcon
  title: string
  text: string
  /** Carrier page tabs (?tab=…) where the answer is */
  tabs: [id: string, label: string][]
}

// What features/compare/vetting.ts reads, grouped the way the carrier page's tabs are.
const CHECKS: Check[] = [
  {
    icon: ShieldCheck,
    title: 'Authority and insurance',
    text: 'Authority active with no revocation pending, how long since it was granted, liability on file (most brokers want $1,000,000) and the estimated next renewal.',
    tabs: [['authority', 'Authority & Insurance']],
  },
  {
    icon: Gauge,
    title: 'Safety record',
    text: 'Out-of-service rates against the national average, crashes in the last 24 months, the FMCSA safety rating and the Estimated ISS.',
    tabs: [['safety', 'Inspections']],
  },
  {
    icon: Network,
    title: 'Identity and fraud signs',
    text: 'Phones, emails or addresses shared with other carriers, and other USDOT numbers sharing its details or trucks, with what happened to them.',
    tabs: [
      ['network', 'Linked carriers'],
      ['chameleon', 'Chameleon check'],
    ],
  },
  {
    icon: Truck,
    title: 'Equipment',
    text: 'The trucks and trailers seen on its inspections, and VINs that also appear under other carriers.',
    tabs: [['equipment', 'Equipment']],
  },
  {
    icon: FileText,
    title: 'Keep the record',
    text: 'Save the dated Safety Score Report with the load, so you can show what you checked and when.',
    tabs: [['safety-score-report', 'Safety Score Report']],
  },
]

/**
 * Broker home: what to look at before giving a carrier a load, each linked to the carrier page tab
 * that answers it. Pick a carrier from the compare list to make the links open its tabs.
 */
export function BookingChecklist() {
  const reveal = useReveal()
  const carrierPath = useCarrierPath()
  const usdots = useCompareList()?.usdots ?? []
  const facts = useComparison(usdots)
  const [picked, setPicked] = useState<number | null>(null)
  const target = picked !== null && usdots.includes(picked) ? picked : (usdots[0] ?? null)

  return (
    <motion.section {...reveal()} className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-300 text-[#060d24]">
            <ClipboardCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={`${LABEL} text-slate-500`}>Before you book</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              What to check on a carrier
            </h2>
          </div>
        </div>
        {usdots.length > 0 && (
          <div
            className="flex min-w-0 flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Open the tabs of"
          >
            <span className="text-xs text-slate-500">Open for</span>
            {facts.map((f) => (
              <button
                key={f.usdot}
                type="button"
                onClick={() => setPicked(f.usdot)}
                aria-pressed={target === f.usdot}
                className={`max-w-44 truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  target === f.usdot
                    ? 'bg-[#101853] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.profile?.legal_name ?? `USDOT ${f.usdot}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHECKS.map(({ icon: Icon, title, text, tabs }, i) => (
          <motion.li
            key={title}
            {...reveal(0.04 * i)}
            className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <div className="flex items-center gap-2.5">
              <span className="font-label grid size-7 shrink-0 place-items-center rounded-full bg-[#101853] text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <Icon className="size-4 shrink-0 text-slate-500" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3">
              {tabs.map(([id, label]) =>
                target !== null ? (
                  <Link
                    key={id}
                    to={`${carrierPath(target)}?tab=${id}`}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-accent-strong hover:underline"
                  >
                    {label} tab
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                ) : (
                  <span key={id} className={`${LABEL} text-slate-500`}>
                    {label} tab
                  </span>
                ),
              )}
            </div>
          </motion.li>
        ))}

        <motion.li
          {...reveal(0.04 * CHECKS.length)}
          className="flex flex-col rounded-xl border border-amber-700/40 bg-amber-50 p-4"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-300 text-[#060d24]">
              <UserCheck className="size-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-slate-900">Still on you</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Public records can’t show these: the insurance certificate confirmed with the insurer
            (cargo cover too), a call to the carrier’s listed contact, the W-9 and a signed carrier
            agreement.
          </p>
        </motion.li>
      </ol>

      {usdots.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Add a carrier to your compare list and these become links to its tabs.
        </p>
      )}
    </motion.section>
  )
}
