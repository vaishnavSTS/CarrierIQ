import { useReducedMotion } from 'motion/react'

export const ease = [0.16, 1, 0.3, 1] as const

/**
 * Props for a motion element that fades up once when scrolled into view; nothing moves when the
 * visitor asks for reduced motion.
 */
export function useReveal() {
  const reduce = useReducedMotion()
  return (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-40px' },
          transition: { duration: 0.45, delay, ease },
        }
}

/** The small uppercase label above a card's title. */
export const LABEL = 'font-label text-[10.5px] font-semibold uppercase tracking-[0.14em]'

/** The card frame used across the broker home. */
export const CARD = 'rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm'
