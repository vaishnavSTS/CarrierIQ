import { useReducedMotion } from 'motion/react'

export const ease = [0.16, 1, 0.3, 1] as const

/** The small uppercase label above a card's content. */
export const LABEL = 'font-label text-[10.5px] font-semibold uppercase tracking-[0.14em]'

/** The card frame used across the carrier portal. */
export const CARD = 'rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm'

/** A violet text link, as elsewhere in the app. */
export const LINK = 'tap text-sm font-medium text-accent-strong hover:underline'

/**
 * Props for a motion element that rises in once on mount, staggered by `i`; nothing moves when
 * the visitor asks for reduced motion.
 */
export function useRise() {
  const reduce = useReducedMotion()
  return (i = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: 0.08 + i * 0.07, ease },
        }
}

/** Like useRise, but waits until the element is scrolled into view (content lower on the page). */
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
