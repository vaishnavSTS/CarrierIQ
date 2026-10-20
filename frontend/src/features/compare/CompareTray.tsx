import { ArrowRight, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link, useLocation } from 'react-router-dom'

import { comparePath, MAX_COMPARE, useCompareList } from './compareContext'

/** Bottom bar while carriers are picked for comparison (hidden on the Compare page itself). */
export function CompareTray() {
  const compare = useCompareList()
  const { pathname } = useLocation()
  const reduce = useReducedMotion()
  const show = compare !== null && compare.usdots.length > 0 && pathname !== compare.page

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
        >
          <div className="flex w-full max-w-xl flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-surface px-4 py-3 shadow-xl shadow-black/40">
            <span className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{compare.usdots.length}</span> of{' '}
              {MAX_COMPARE} carriers selected
              {compare.usdots.length === 1 && (
                <span className="block text-xs text-slate-500">Pick at least one more</span>
              )}
            </span>
            <button
              type="button"
              onClick={compare.clear}
              className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <X className="size-4" aria-hidden />
              Clear
            </button>
            <Link
              to={comparePath(compare.page, compare.usdots)}
              className="inline-flex items-center gap-1 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active"
            >
              Compare
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
