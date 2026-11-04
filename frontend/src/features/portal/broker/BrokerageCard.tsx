import { ArrowUpRight, Landmark } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import type { Brokerage } from '../../../types/auth'
import { formatLocalDate } from '../../../utils/format'
import { CARD, LABEL, useReveal } from './reveal'

const SOURCE_LABEL: Record<string, string> = {
  MOTUS: 'FMCSA Motus',
  LEGACY_LI: 'FMCSA L&I',
}

/**
 * Broker home: the brokerage as FMCSA confirmed it at sign-up (GET /broker/overview). A record of
 * that check, not a live status: nothing here is re-checked or watched.
 */
export function BrokerageCard({
  brokerage,
  fallbackName,
  loading,
}: {
  brokerage: Brokerage | undefined
  fallbackName: string
  loading: boolean
}) {
  const reveal = useReveal()
  const source = SOURCE_LABEL[brokerage?.authority_source ?? ''] ?? 'FMCSA'
  const rows: [string, string | null | undefined][] = [
    ['Broker docket', brokerage?.docket_number],
    ['USDOT', brokerage?.usdot_number ? String(brokerage.usdot_number) : null],
    ['Confirmed with', brokerage?.authority_checked_at ? source : null],
    [
      'Checked',
      brokerage?.authority_checked_at ? formatLocalDate(brokerage.authority_checked_at) : null,
    ],
  ]
  const shown = rows.filter(([, value]) => value)

  return (
    <motion.section {...reveal(0.05)} className={`${CARD} flex flex-col`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className={`${LABEL} text-slate-500`}>Your brokerage</p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-slate-900">
            {brokerage?.organization_name ?? fallbackName}
          </h2>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2" aria-label="Loading">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        </div>
      ) : shown.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {shown.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
              <dt className={`${LABEL} text-slate-500`}>{label}</dt>
              <dd className="mt-0.5 truncate font-mono text-sm text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-600">No FMCSA details are saved with this account.</p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {brokerage?.authority_checked_at
          ? 'Broker authority as FMCSA showed it when you signed up.'
          : 'Details from your sign-up.'}
      </p>

      {brokerage?.usdot_number && (
        <Link
          to={`/broker/carriers/${brokerage.usdot_number}?tab=authority`}
          className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-strong hover:underline"
        >
          Open your current FMCSA record
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      )}
    </motion.section>
  )
}
