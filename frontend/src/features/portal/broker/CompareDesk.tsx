import { ArrowRight, Columns3, Plus, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { ApiError } from '../../../api/client'
import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierPath } from '../../../hooks/usePortalMode'
import { comparePath, MAX_COMPARE, useCompareList } from '../../compare/compareContext'
import { useComparison, type CarrierFacts } from '../../compare/useComparison'
import { VERDICT, vetCarrier } from '../../compare/vetting'
import { CARD, LABEL, useReveal } from './reveal'

/**
 * Broker home: the carriers picked for comparison this session, each with its booking check
 * verdict and the first item behind it, and the way to the Compare page. Reads the same data as
 * the Compare page (useComparison), so opening it after this is instant.
 */
export function CompareDesk() {
  const compare = useCompareList()
  const usdots = compare?.usdots ?? []
  const facts = useComparison(usdots)
  const reveal = useReveal()
  const reduce = useReducedMotion()
  if (!compare) return null
  const open = MAX_COMPARE - usdots.length

  return (
    <motion.section {...reveal()} className={`${CARD} flex flex-col`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
            <Columns3 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={`${LABEL} text-slate-500`}>
              Compare list · {usdots.length} of {MAX_COMPARE}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              Carriers you’re weighing for a load
            </h2>
          </div>
        </div>
        {usdots.length > 0 && (
          <Link
            to={comparePath(compare.page, usdots)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#101853] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1b2775]"
          >
            {usdots.length > 1 ? 'Compare side by side' : 'Open Compare'}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        <AnimatePresence initial={false}>
          {facts.map((f) => (
            <motion.li
              key={f.usdot}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
            >
              <PickedCarrier facts={f} onRemove={() => compare.remove(f.usdot)} />
            </motion.li>
          ))}
        </AnimatePresence>
        {Array.from({ length: open }, (_, i) => (
          <li
            key={`open-${i}`}
            className="flex min-h-24 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500"
          >
            <Plus className="size-3.5 shrink-0" aria-hidden />
            {i === 0 && usdots.length === 0 ? 'Press Compare on a search result' : 'Open slot'}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-slate-500">
        Kept in this browser tab until you close it. The verdict is Carrier Safety Scan’s reading of
        public FMCSA records, not a safety rating or a guarantee.
      </p>
    </motion.section>
  )
}

function PickedCarrier({ facts, onRemove }: { facts: CarrierFacts; onRemove: () => void }) {
  const carrierPath = useCarrierPath()
  const vetting = vetCarrier(facts)
  const notFound = facts.profileError instanceof ApiError && facts.profileError.status === 404
  const first = vetting && (vetting.stops[0] ?? vetting.major[0] ?? vetting.minor[0])
  const accent = !vetting
    ? 'bg-slate-300'
    : vetting.verdict === 'ready'
      ? 'bg-emerald-600'
      : vetting.verdict === 'review'
        ? 'bg-amber-600'
        : 'bg-red-600'

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 py-3 pl-4 pr-3">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {facts.profile ? (
            <Link
              to={carrierPath(facts.usdot)}
              className="block truncate text-sm font-semibold text-slate-900 hover:underline"
            >
              {facts.profile.legal_name}
            </Link>
          ) : (
            <span
              className={`block text-sm ${facts.profileError ? 'text-red-700' : 'text-slate-500'}`}
            >
              {facts.profileError
                ? notFound
                  ? 'Not found in FMCSA data'
                  : 'Couldn’t load this carrier'
                : 'Loading from FMCSA…'}
            </span>
          )}
          <span className="block font-mono text-xs text-slate-500">USDOT {facts.usdot}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Remove USDOT ${facts.usdot} from the compare list`}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2">
        {vetting ? (
          <>
            <StatusBadge
              label={VERDICT[vetting.verdict].label}
              tone={VERDICT[vetting.verdict].tone}
            />
            {first && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{first.text}</p>}
          </>
        ) : (
          !facts.profileError && (
            <span
              className="inline-block h-4 w-24 animate-pulse rounded-full bg-slate-200"
              aria-label="Loading booking check"
            />
          )
        )}
      </div>
    </div>
  )
}
