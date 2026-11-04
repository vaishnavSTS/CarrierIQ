import { Ban, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { MINOR_LIMIT, NEW_AUTHORITY_MONTHS, THIN_RECORD } from '../../compare/vetting'
import { ease, LABEL } from './reveal'

// The four verdicts of features/compare/vetting.ts, in the order a broker reads them. Colours are
// fixed (the 300 shades aren't flipped by the dark theme) because the card sits on the dark hero.
const RUNGS = [
  {
    label: 'Ready to book',
    icon: CircleCheck,
    color: 'text-emerald-300',
    bar: 'bg-emerald-300',
    text: 'No caution items in the public records',
  },
  {
    label: 'Book with review',
    icon: TriangleAlert,
    color: 'text-amber-300',
    bar: 'bg-amber-300',
    text: `1–${MINOR_LIMIT - 1} minor items, e.g. authority under ${NEW_AUTHORITY_MONTHS} months or fewer than ${THIN_RECORD} inspections`,
  },
  {
    label: 'High risk',
    icon: CircleAlert,
    color: 'text-orange-300',
    bar: 'bg-orange-300',
    text: `A major item (e.g. a conditional rating, a fatal crash) or ${MINOR_LIMIT}+ minor ones`,
  },
  {
    label: 'Do not book',
    icon: Ban,
    color: 'text-red-300',
    bar: 'bg-red-300',
    text: 'A hard stop: authority not active, no liability insurance on file, an out-of-service order',
  },
] as const

/**
 * Broker hero, beside the search: the booking check every carrier page opens with, as the four
 * verdicts and what leads to each. The rule, not sample data.
 */
export function VerdictLadder() {
  const reduce = useReducedMotion()
  return (
    <div className="rounded-2xl border border-white/15 bg-[#060d24]/55 p-5 text-white shadow-2xl backdrop-blur">
      <p className={`${LABEL} text-amber-300`}>Booking check</p>
      <p className="mt-1 text-sm font-semibold">Every carrier page opens with one</p>
      <ol className="mt-4 space-y-2.5">
        {RUNGS.map(({ label, icon: Icon, color, bar, text }, i) => (
          <motion.li
            key={label}
            initial={reduce ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.5 + i * 0.18, ease }}
            className="relative flex gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5"
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
            <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${color}`}>{label}</span>
              <span className="block text-xs leading-snug text-white/80">{text}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-snug text-white/70">
        Carrier Safety Scan’s reading of public FMCSA records. It isn’t a safety rating or a
        guarantee, and the booking decision is yours.
      </p>
    </div>
  )
}
