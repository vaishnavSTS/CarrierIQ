import {
  FileText,
  Gauge,
  Network,
  Search,
  ShieldCheck,
  SearchCheck,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'

const ease = [0.16, 1, 0.3, 1] as const

/** Fades in once when scrolled into view. */
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, delay, ease },
})

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Authority and insurance',
    text: 'Is the MC active, is liability and cargo insurance on file, is there a BOC-3, any revocations.',
  },
  {
    icon: Gauge,
    title: 'Estimated ISS – Safety score',
    text: '1–100, by FMCSA’s published method: Satisfactory, At risk or High risk, and which safety category drives it.',
  },
  {
    icon: TriangleAlert,
    title: 'Inspections and crashes',
    text: 'Out-of-service rates against the national average, violations, and crashes over the last two years.',
  },
  {
    icon: Network,
    title: 'Fraud red flags',
    text: 'Phones, emails, addresses or officers shared with other carriers, and links to revoked USDOT numbers.',
  },
  {
    icon: Truck,
    title: 'Equipment',
    text: 'The trucks and trailers seen on inspections, decoded from their VINs, and VINs used by other carriers.',
  },
  {
    icon: FileText,
    title: 'Carrier packet',
    text: 'A dated, sourced summary of the carrier you can print or save to your load file.',
  },
]

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Search,
    title: 'Search',
    text: 'USDOT, MC or name. A carrier not yet in CarrierIQ is loaded from FMCSA in a few seconds.',
  },
  {
    icon: SearchCheck,
    title: 'Review',
    text: 'Start with the red flags and the safety score, then open any tab for the details.',
  },
  {
    icon: FileText,
    title: 'Keep a record',
    text: 'Save the packet with the load, so you can show what you checked and when.',
  },
]

/** Broker home, below the search: what a carrier profile shows and how to use it. */
export function BrokerGuide() {
  return (
    <div className="space-y-10">
      <section>
        <motion.h2 {...reveal()} className="text-lg font-semibold tracking-tight text-slate-900">
          What you see on every carrier
        </motion.h2>
        <motion.p {...reveal(0.05)} className="mt-1 text-sm text-slate-600">
          Public FMCSA and NHTSA records, with the source named on every value.
        </motion.p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <motion.article
              key={title}
              {...reveal(0.05 * i)}
              whileHover={{ y: -3 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 transition-colors hover:border-accent/50"
            >
              <div
                aria-hidden
                className="absolute -right-12 -top-12 size-32 rounded-full bg-violet-500/15 opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
              />
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section>
        <motion.h2 {...reveal()} className="text-lg font-semibold tracking-tight text-slate-900">
          How it works
        </motion.h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              {...reveal(0.1 * i)}
              className="relative rounded-2xl border border-slate-200 bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <Icon className="size-4 text-accent-strong" aria-hidden />
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{text}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <motion.p {...reveal()} className="text-xs text-slate-500">
        CarrierIQ shows what FMCSA’s public records say and flags what usually needs a closer look.
        It does not approve or reject carriers: the booking decision stays with you. The Estimated
        ISS is CarrierIQ’s estimate, not FMCSA’s official score.
      </motion.p>
    </div>
  )
}
