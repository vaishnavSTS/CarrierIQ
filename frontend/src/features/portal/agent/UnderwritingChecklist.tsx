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
    <section
      id="underwriting-checklist"
      className="scroll-mt-6 rounded-2xl border border-slate-200 bg-surface shadow-sm"
    >
      <div className="border-b border-slate-200 p-5">
        <motion.h3 {...reveal()} className="text-lg font-semibold text-slate-950">
          Where each answer lives on a carrier page
        </motion.h3>
        <motion.p {...reveal(0.03)} className="mt-1 max-w-3xl text-sm text-slate-600">
          Open the carrier and go down this list: each question is answered on one tab, from FMCSA
          and NHTSA public records with the source named on each.
        </motion.p>
      </div>
      <ol className="divide-y divide-slate-100">
        {CHECKLIST.map((entry, i) => (
          <motion.li key={entry.tab} {...reveal(0.04 * i)}>
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
    <article className="grid gap-x-6 gap-y-3 p-5 transition-colors hover:bg-slate-50/60 md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.3fr)]">
      <span className="grid size-10 place-items-center rounded-full border-2 border-[var(--portal-ink)] font-label text-sm font-semibold text-slate-900">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <h4 className="text-base font-semibold text-slate-900">{question}</h4>
        <p className="mt-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--portal-ink)] px-2.5 py-0.5 text-xs font-medium text-white">
            <Icon className="size-3.5" aria-hidden />
            Tab: {label}
          </span>
        </p>
      </div>

      <div className="min-w-0">
        <ul className="space-y-1.5 text-sm leading-relaxed text-slate-600">
          {shows.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="pt-3">
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
                <ol className="mt-3 space-y-2 border-l-2 border-[var(--portal-accent)] pl-3 text-sm leading-relaxed text-slate-700">
                  {howTo.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </article>
  )
}
