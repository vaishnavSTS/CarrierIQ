import { Check, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { CARD, LABEL } from './reveal'

/** What public records can't show: the broker confirms these with the carrier for each load. */
const ITEMS = [
  { key: 'coi', text: 'Insurance certificate confirmed with the insurer, cargo cover too' },
  { key: 'call', text: 'Called the carrier on the contact listed with FMCSA' },
  { key: 'w9', text: 'W-9 received' },
  { key: 'agreement', text: 'Carrier agreement signed' },
]

/**
 * The paperwork side of booking, as a checklist the broker ticks off for the load in front of
 * them. Kept only on this page (nothing is saved): it's a reminder, not a record.
 */
export function PaperworkCard() {
  const [done, setDone] = useState<Record<string, boolean>>({})
  const count = ITEMS.filter((i) => done[i.key]).length

  return (
    <section className={CARD} aria-labelledby="paperwork">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className={`${LABEL} text-slate-500`}>Still on you · {count} of 4</div>
            <h2 id="paperwork" className="text-base font-semibold leading-tight text-slate-950">
              Paperwork for this load
            </h2>
          </div>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={() => setDone({})}
            className="tap inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${(count / ITEMS.length) * 100}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1">
        {ITEMS.map(({ key, text }) => {
          const on = !!done[key]
          return (
            <li key={key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setDone((d) => ({ ...d, [key]: !d[key] }))}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
                    on ? 'border-emerald-600 bg-emerald-600 text-surface' : 'border-slate-300'
                  }`}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                </span>
                <span className={on ? 'text-slate-500 line-through' : 'text-slate-800'}>
                  {text}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Public records can’t show these. Not saved: clears when you leave the page.
      </p>
    </section>
  )
}
