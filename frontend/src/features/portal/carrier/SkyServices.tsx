import {
  BadgeCheck,
  Car,
  ClipboardCheck,
  FileCheck2,
  FlaskConical,
  FolderOpen,
  Handshake,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { CARD, LABEL, useRise } from './ui'

/** The services on the Compliance tab (features/carrier-profile/compliance), by name only. */
const SERVICES: { icon: LucideIcon; label: string }[] = [
  { icon: ScrollText, label: 'DOT / MC authority' },
  { icon: FileCheck2, label: 'UCR filing' },
  { icon: FlaskConical, label: 'Drug & alcohol consortium' },
  { icon: FolderOpen, label: 'Driver files' },
  { icon: Car, label: 'MVR reports' },
  { icon: ClipboardCheck, label: 'Background checks' },
  { icon: BadgeCheck, label: 'Certificate of good standing' },
]

/**
 * What Sky Transport Solutions can take off the carrier's hands, as tiles that open the
 * Compliance tab, where each one is ordered or requested.
 */
export function SkyServices({ page }: { page: string }) {
  const rise = useRise()
  return (
    <motion.section {...rise(5)} className={CARD} aria-labelledby="sky-services">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--portal-ink)] text-white">
            <Handshake className="size-5" aria-hidden />
          </span>
          <div>
            <div className={`${LABEL} text-slate-500`}>Get it done with Sky</div>
            <h2 id="sky-services" className="text-lg font-semibold leading-tight text-slate-950">
              Paperwork Sky Transport Solutions can handle for you
            </h2>
          </div>
        </div>
        <Link
          to={`${page}?tab=compliance`}
          className="tap text-sm font-medium text-accent-strong hover:underline"
        >
          See all on the Compliance tab
        </Link>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {SERVICES.map(({ icon: Icon, label }) => (
          <li key={label}>
            <Link
              to={`${page}?tab=compliance`}
              className="group flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-surface hover:shadow-sm"
            >
              <Icon className="size-5 text-accent-strong" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
