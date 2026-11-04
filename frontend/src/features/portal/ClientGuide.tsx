import {
  CalendarClock,
  FileWarning,
  Gauge,
  SearchCheck,
  Send,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'

import { CARD, LABEL, useReveal } from './carrier/ui'

interface GuideItem {
  icon: LucideIcon
  title: string
  text: string
}

/** What a carrier gets: know what brokers see, fix it, and prove it. */
const FEATURES: GuideItem[] = [
  {
    icon: ShieldCheck,
    title: 'Know before brokers do',
    text: 'The items broker vetting tools usually flag on your record, such as a shared phone or address, an old company update (MCS-150) or a missing process agent filing (BOC-3), before a broker sees them.',
  },
  {
    icon: Wrench,
    title: 'Fix it the right way',
    text: 'Each flag comes with how it is usually resolved: a company update (MCS-150), a process agent filing (BOC-3) or a current insurance certificate.',
  },
  {
    icon: Gauge,
    title: 'Lower your safety score',
    text: 'Which violations weigh most in your CSA measures and Estimated ISS, the 49 CFR rule behind each, and what usually helps.',
  },
  {
    icon: FileWarning,
    title: 'Challenge wrong records',
    text: 'When an inspection or violation on your record is wrong, how to ask FMCSA to correct it through DataQs.',
  },
  {
    icon: CalendarClock,
    title: 'Stay current',
    text: 'When your company update (MCS-150) is due and when your insurance usually renews, so you can plan for both.',
  },
  {
    icon: Send,
    title: 'Win the load',
    text: 'A dated, sourced Safety Score Report to send brokers and shippers, so they see your record and its sources before they ask.',
  },
]

const STEPS: GuideItem[] = [
  {
    icon: SearchCheck,
    title: 'Check',
    text: 'Start with the action center above, then open your carrier’s “How brokers see you” tab and the safety score.',
  },
  {
    icon: Wrench,
    title: 'Fix',
    text: 'Work through what is flagged: a company update (MCS-150), a process agent filing (BOC-3), or a DataQs challenge for a wrong violation.',
  },
  {
    icon: Send,
    title: 'Share',
    text: 'Send brokers the Safety Score Report, so they see your record and its sources before they ask.',
  },
]

/**
 * Carrier portal home, near the bottom: what Carrier Safety Scan does for the company, and the
 * check-fix-share routine, in one compact card (the carrier's own data sits above it).
 */
export function ClientGuide() {
  const reveal = useReveal()
  return (
    <motion.section {...reveal()} className={CARD} aria-labelledby="client-guide">
      <div className={`${LABEL} text-slate-500`}>How Carrier Safety Scan helps</div>
      <h2 id="client-guide" className="mt-1 text-xl font-semibold text-slate-950">
        What Carrier Safety Scan does for your company
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Built from the same public FMCSA and NHTSA records brokers check, with the source named on
        every value.
      </p>

      <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          </li>
        ))}
      </ul>

      <ol className="mt-6 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
        {STEPS.map(({ title, text }, i) => (
          <li key={title} className="rounded-xl bg-canvas p-4">
            <div className="flex items-center gap-2.5">
              <span className="font-label grid size-7 place-items-center rounded-full bg-amber-300 text-xs font-semibold text-[#060d24]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-xs text-slate-500">
        Carrier Safety Scan shows what FMCSA’s public records say. A fix you make with FMCSA shows
        here once FMCSA publishes it. Flags are what brokers’ checks commonly react to, not a
        finding about your company. The Estimated ISS is Carrier Safety Scan’s estimate, not FMCSA’s
        official score. Questions? Contact your STS team.
      </p>
    </motion.section>
  )
}
