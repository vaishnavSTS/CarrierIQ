import { ArrowRight, Columns3, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { useCarrierProfile } from '../../../hooks/useCarrierProfile'
import { comparePath, MAX_COMPARE, useCompareList } from '../../compare/compareContext'

/** The tabs an agent opens most, linked straight from each picked carrier. */
const QUICK_TABS = [
  ['authority', 'Authority & Insurance'],
  ['safety', 'Inspections'],
  ['safety-score-report', 'Report'],
] as const

/**
 * Agent home: the carriers picked for comparison (up to MAX_COMPARE), each with links to its main
 * underwriting tabs, and the side-by-side Compare page. Nothing while none are picked.
 */
export function AgentCompareList() {
  const compare = useCompareList()
  const reduce = useReducedMotion()
  if (!compare || compare.usdots.length === 0) return null
  const carrierPage = compare.page.replace(/\/compare$/, '/carriers')

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--portal-ink)] text-white">
            <Columns3 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-label text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
              Your compare list · {compare.usdots.length} of {MAX_COMPARE}
            </p>
            <h2 className="text-lg font-semibold text-slate-950">Carriers you’re weighing</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={compare.clear}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Clear
          </button>
          {compare.usdots.length > 1 && (
            <Link
              to={comparePath(compare.page, compare.usdots)}
              className="inline-flex items-center gap-1 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active"
            >
              Compare side by side
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {compare.usdots.map((usdot) => (
          <CompareEntry
            key={usdot}
            usdot={usdot}
            carrierPage={carrierPage}
            onRemove={() => compare.remove(usdot)}
          />
        ))}
      </ul>
      {compare.usdots.length === 1 && (
        <p className="mt-3 text-xs text-slate-500">
          Pick at least one more with Compare on a search result or carrier page to see them side by
          side.
        </p>
      )}
    </motion.section>
  )
}

function CompareEntry({
  usdot,
  carrierPage,
  onRemove,
}: {
  usdot: number
  carrierPage: string
  onRemove: () => void
}) {
  const { data } = useCarrierProfile(usdot)
  const name = data?.legal_name
  const href = `${carrierPage}/${usdot}`

  return (
    <li className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={href} className="min-w-0 hover:underline">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {name ?? `USDOT ${usdot}`}
          </span>
          <span className="block font-mono text-xs text-slate-500">USDOT {usdot}</span>
        </Link>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove USDOT ${usdot} from the compare list`}
          className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_TABS.map(([tab, label]) => (
          <Link
            key={tab}
            to={`${href}?tab=${tab}`}
            className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-accent-strong ring-1 ring-slate-200 hover:ring-slate-300"
          >
            {label}
          </Link>
        ))}
      </div>
    </li>
  )
}
