import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

const ease = [0.16, 1, 0.3, 1] as const

/** Fades in once when scrolled into view. */
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, delay, ease },
})

export interface GuideItem {
  icon: LucideIcon
  title: string
  text: string
}

/**
 * Portal home, below the main content: what CarrierSafetyScan shows (cards), how to use it (numbered
 * steps) and a closing note. The broker and client portals fill it with their own wording.
 */
export function PortalGuide({
  featuresTitle,
  featuresIntro,
  features,
  steps,
  note,
}: {
  featuresTitle: string
  featuresIntro: string
  features: GuideItem[]
  steps: GuideItem[]
  note: string
}) {
  return (
    <div className="space-y-10">
      <section>
        <motion.h2 {...reveal()} className="text-lg font-semibold tracking-tight text-slate-900">
          {featuresTitle}
        </motion.h2>
        <motion.p {...reveal(0.05)} className="mt-1 text-sm text-slate-600">
          {featuresIntro}
        </motion.p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }, i) => (
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
          {steps.map(({ icon: Icon, title, text }, i) => (
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
        {note}
      </motion.p>
    </div>
  )
}
