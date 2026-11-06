import { ArrowRight, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { createContext, useContext, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

const ease = [0.16, 1, 0.3, 1] as const

/** Fades in once when scrolled into view. */
export const reveal = (delay = 0, duration = 0.6) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration, delay, ease },
})

export function PrimaryLink({
  to,
  small = false,
  children,
}: {
  to: string
  small?: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-2 rounded-xl bg-cta font-medium text-cta-ink shadow-lg shadow-brand-glow/30 transition-all hover:bg-cta-hover hover:shadow-xl hover:shadow-brand-glow/40 active:bg-cta-active ${
        small ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm'
      }`}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

export function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

/**
 * A full-width band of the page with its own background, so the page changes as it scrolls (no
 * two bands next to each other should share a tone): plain white, a dot grid, a line grid, a soft
 * lavender tint, a warm cream, a colour mesh, deep navy, or a darkened photo. On `dark` and `photo`
 * the text inside turns white.
 */
export type BandTone = 'plain' | 'dots' | 'grid' | 'tint' | 'warm' | 'mesh' | 'dark' | 'photo'

const DarkBand = createContext(false)

export function Band({
  tone,
  photo,
  children,
}: {
  tone: BandTone
  /** The picture behind a `photo` band */
  photo?: string
  children: ReactNode
}) {
  return (
    <DarkBand.Provider value={tone === 'dark' || tone === 'photo'}>
      <section className={`band band-${tone} relative isolate overflow-hidden py-20 md:py-24`}>
        {tone === 'photo' && photo && (
          <div aria-hidden className="absolute inset-0 -z-10">
            <img src={photo} alt="" loading="lazy" className="size-full object-cover" />
            <div className="band-photo-scrim absolute inset-0" />
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4">{children}</div>
      </section>
    </DarkBand.Provider>
  )
}

/** For dark sections that aren't a Band (a hero): headings and highlights inside turn light. */
export function OnDark({ children }: { children: ReactNode }) {
  return <DarkBand.Provider value>{children}</DarkBand.Provider>
}

/** True inside a deep-navy band: text there is white. */
export function useDarkBand(): boolean {
  return useContext(DarkBand)
}

/** The words of a heading that stand out (gold on navy, violet on light). */
export function Accent({ children }: { children: ReactNode }) {
  return (
    <span className={`font-accent ${useDarkBand() ? 'text-amber-300' : 'text-accent-strong'}`}>
      {children}
    </span>
  )
}

/**
 * A section's heading: a numbered label ("01 · What you get"), a large title on the left and,
 * on wide screens, a short explanation beside it.
 */
export function SectionHeading({
  eyebrow,
  title,
  number,
  aside,
}: {
  eyebrow: string
  title: ReactNode
  number?: string
  aside?: ReactNode
}) {
  const dark = useDarkBand()
  return (
    <motion.div
      {...reveal()}
      className="grid items-end gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
    >
      <div>
        <p
          className={`font-label flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] ${dark ? 'text-amber-300' : 'text-accent-strong'}`}
        >
          <span aria-hidden className="h-px w-8 bg-current" />
          {number && <span>{number} ·</span>}
          {eyebrow}
        </p>
        <h2
          className={`mt-4 text-3xl font-semibold leading-[1.08] tracking-tight md:text-[2.75rem] ${dark ? 'text-white' : 'text-slate-950'}`}
        >
          {title}
        </h2>
      </div>
      {aside && (
        <p
          className={`text-sm leading-relaxed md:text-base ${dark ? 'text-white/80' : 'text-slate-600'}`}
        >
          {aside}
        </p>
      )}
    </motion.div>
  )
}
