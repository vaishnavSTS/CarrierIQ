import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'

import { CHECKLIST, type ChecklistItem } from './checklist'

const ease = [0.16, 1, 0.3, 1] as const

/**
 * Agent home: each question an underwriting review asks of a carrier, the carrier tab that answers
 * it, what the tab shows, and (opened on demand) how to read it.
 */
export function UnderwritingChecklist() {
  const reduce = useReducedMotion()
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-40px' },
          transition: { duration: 0.5, delay, ease },
        }

  return (
    <section id="underwriting-checklist" className="scroll-mt-6">
      <motion.p
        {...reveal()}
        className="font-label text-[10.5px] uppercase tracking-[0.14em] text-accent-strong"
      >
        Underwriting checklist
      </motion.p>
      <motion.h2 {...reveal(0.03)} className="mt-1 text-2xl font-semibold text-slate-950">
        Where each answer lives on a carrier page
      </motion.h2>
      <motion.p {...reveal(0.06)} className="mt-1 max-w-3xl text-sm text-slate-600">
        Search a carrier above and open its profile: each question below is answered on one tab.
        Values come from FMCSA and NHTSA public records, with the source named on each.
      </motion.p>

      <ol className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CHECKLIST.map((entry, i) => (
          <motion.li key={entry.tab} {...reveal(0.05 * i)} className="flex">
            <ChecklistCard entry={entry} index={i} />
          </motion.li>
        ))}
      </ol>
    </section>
  )
}

function ChecklistCard({ entry, index }: { entry: ChecklistItem; index: number }) {
  const { icon: Icon, label, question, shows, howTo } = entry
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const panelId = useId()

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-lg">
      <div
        aria-hidden
        className="absolute -right-12 -top-12 size-32 rounded-full bg-brand-glow/15 opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="font-label text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <h3 className="mt-4 text-sm font-semibold text-slate-900">{question}</h3>
      <p className="mt-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#101853] px-2.5 py-0.5 text-xs font-medium text-white">
          <span className="size-1.5 rounded-full bg-amber-300" aria-hidden />
          Tab: {label}
        </span>
      </p>

      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-600">
        {shows.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
        >
          How to use it
          <ChevronDown
            className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              className="overflow-hidden"
            >
              <ol className="mt-3 space-y-2 border-l-2 border-amber-300 pl-3 text-sm leading-relaxed text-slate-700">
                {howTo.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  )
}
