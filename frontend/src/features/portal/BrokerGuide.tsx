import { Columns3, FileText, Search, SearchCheck, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { MAX_COMPARE } from '../compare/compareContext'
import { LABEL, useReveal } from './broker/reveal'

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Search,
    title: 'Search',
    text: 'USDOT, MC or name. A carrier not yet in Carrier Safety Scan is loaded from FMCSA in a few seconds.',
  },
  {
    icon: SearchCheck,
    title: 'Read the booking check',
    text: 'At the top of the carrier page: the verdict and every item behind it. Open a tab for the detail.',
  },
  {
    icon: Columns3,
    title: 'Compare',
    text: `Press Compare on up to ${MAX_COMPARE} carriers to see them side by side, best value on each line marked.`,
  },
  {
    icon: FileText,
    title: 'Keep a record',
    text: 'Save the Safety Score Report with the load: dated, with the source named on every value.',
  },
]

/** Broker home, at the bottom: the four steps of vetting a carrier here, and what it is not. */
export function BrokerGuide() {
  const reveal = useReveal()
  return (
    <section aria-labelledby="broker-guide" className="space-y-4">
      <motion.div {...reveal()}>
        <p className={`${LABEL} text-accent-strong`}>How it works</p>
        <h2 id="broker-guide" className="mt-1 text-2xl font-semibold text-slate-950">
          From search to a booked load
        </h2>
      </motion.div>

      <div className="relative">
        {/* The line joining the steps on wide screens. */}
        <span
          aria-hidden
          className="absolute left-[12.5%] right-[12.5%] top-[2.375rem] hidden h-px bg-gradient-to-r from-amber-300 via-slate-300 to-amber-300 lg:block"
        />
        <ol className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              {...reveal(0.08 * i)}
              className="group relative rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="font-label relative grid size-9 shrink-0 place-items-center rounded-full bg-amber-300 text-sm font-semibold text-[#060d24] ring-4 ring-surface">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="grid size-8 place-items-center rounded-lg bg-[#101853] text-white transition-transform group-hover:-translate-y-0.5">
                  <Icon className="size-4" aria-hidden />
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
            </motion.li>
          ))}
        </ol>
      </div>

      <motion.p {...reveal()} className="text-xs text-slate-500">
        Carrier Safety Scan shows what FMCSA’s and NHTSA’s public records say and flags what usually
        needs a closer look. It does not approve or reject carriers: the booking decision stays with
        you. The Estimated ISS is Carrier Safety Scan’s estimate, not FMCSA’s official score.
      </motion.p>
    </section>
  )
}
