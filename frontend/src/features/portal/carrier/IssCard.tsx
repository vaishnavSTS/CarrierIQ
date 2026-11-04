import { AlertTriangle, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import type { EstimatedIss } from '../../../types/carrierSafety'
import { formatMonth } from '../../../utils/format'
import { IssGauge } from '../../carrier-profile/safety/IssGauge'
import { CARD, LABEL, LINK, useRise } from './ui'

/**
 * The Estimated ISS on the dial the Inspections tab uses, why it is what it is, and the CSA
 * categories over FMCSA's threshold (clients get over/under, never the estimated percentile).
 */
export function IssCard({
  iss,
  loading,
  to,
  index,
}: {
  iss: EstimatedIss | null | undefined
  loading: boolean
  to: string
  index: number
}) {
  const rise = useRise()
  const over =
    iss && iss.algorithm !== 'INSUFFICIENT_DATA'
      ? iss.basics.filter((b) => b.assessed && b.over_threshold)
      : []

  return (
    <motion.div {...rise(index)} className={`${CARD} flex flex-col`}>
      <div className={`${LABEL} text-slate-500`}>Estimated ISS · safety score</div>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-3 flex justify-center">
            <IssGauge iss={iss} className="w-44" />
          </div>
          {iss ? (
            <>
              <p className="mt-3 text-sm text-slate-700">{iss.reason}.</p>
              {over.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-600">
                    Over FMCSA’s threshold (estimated)
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {over.map((b) => (
                      <li
                        key={b.basic}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"
                      >
                        <AlertTriangle className="size-3" aria-hidden />
                        {b.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Carrier Safety Scan’s estimate from public FMCSA data, not FMCSA’s official score ·
                FMCSA data {formatMonth(iss.data_month)}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              The Estimated ISS is not available yet for this carrier.
            </p>
          )}
        </>
      )}
      <Link to={to} className={`${LINK} mt-auto inline-flex items-center gap-0.5 pt-4`}>
        What drives it and how to improve
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </motion.div>
  )
}
