import { ArrowRight, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const ease = [0.16, 1, 0.3, 1] as const

/** Fades in once when scrolled into view. */
export const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease },
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

export function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div {...reveal()} className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
        {title}
      </h2>
    </motion.div>
  )
}
