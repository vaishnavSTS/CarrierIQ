import { motion, useReducedMotion } from 'motion/react'

/**
 * Decorative page backdrop for the public pages: slow-drifting aurora glows (violet, fuchsia,
 * indigo) under a fine film grain, fading into the page colour at the bottom. Sits behind the
 * content of its nearest positioned parent; never captures clicks. Holds still for people who
 * prefer reduced motion.
 */
export function AuroraBackdrop({ className = 'inset-0' }: { className?: string }) {
  const reduce = useReducedMotion()

  const drift = (x: number[], y: number[], duration: number) =>
    reduce
      ? {}
      : {
          animate: { x, y },
          transition: {
            duration,
            repeat: Infinity,
            repeatType: 'mirror' as const,
            ease: 'easeInOut' as const,
          },
        }

  return (
    <div aria-hidden className={`pointer-events-none absolute -z-10 overflow-hidden ${className}`}>
      <motion.div
        className="absolute -left-[10%] -top-[20%] size-[46rem] rounded-full bg-violet-600/25 blur-[140px]"
        {...drift([0, 80, -40], [0, 60, 20], 26)}
      />
      <motion.div
        className="absolute -right-[12%] top-[5%] size-[40rem] rounded-full bg-fuchsia-600/20 blur-[140px]"
        {...drift([0, -70, 30], [0, 50, -30], 32)}
      />
      <motion.div
        className="absolute left-[30%] top-[35%] size-[36rem] rounded-full bg-indigo-500/15 blur-[150px]"
        {...drift([0, 60, -60], [0, -40, 30], 38)}
      />

      {/* A thin light along the top edge, like a soft horizon. */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/40 to-transparent" />

      <div className="bg-grain absolute inset-0 opacity-[0.07] mix-blend-overlay" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  )
}
