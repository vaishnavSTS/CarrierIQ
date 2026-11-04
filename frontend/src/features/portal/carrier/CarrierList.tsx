import { ChevronRight, Truck } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import type { PortalCarrier } from '../../../types/auth'
import { formatDateTime } from '../../../utils/format'
import { statusTone } from '../../../utils/status'
import { CARD, LABEL, useRise } from './ui'

/** With several carriers: all of them in one compact list, each opening its page. */
export function CarrierList({ carriers }: { carriers: PortalCarrier[] }) {
  const rise = useRise()
  return (
    <motion.section {...rise(0)} className={CARD} aria-labelledby="my-carriers">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="my-carriers" className="text-lg font-semibold text-slate-950">
          My carriers
        </h2>
        <span className={`${LABEL} text-slate-500`}>{carriers.length} linked</span>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {carriers.map((c) => (
          <li key={c.usdot_number}>
            <Link
              to={`/portal/carriers/${c.usdot_number}`}
              className="group flex h-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition-colors hover:border-accent"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--portal-ink)] text-white">
                <Truck className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {c.legal_name ?? 'Details not loaded yet'}
                  {c.dba_name && (
                    <span className="font-normal text-slate-500"> · DBA {c.dba_name}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>
                    USDOT <span className="font-mono">{c.usdot_number}</span>
                  </span>
                  {c.registration_status && (
                    <StatusBadge
                      label={c.registration_status}
                      tone={statusTone(c.registration_status)}
                    />
                  )}
                  {c.last_refreshed_at && (
                    <span>FMCSA data as of {formatDateTime(c.last_refreshed_at)}</span>
                  )}
                </div>
              </div>
              <ChevronRight
                className="size-4 shrink-0 text-slate-400 group-hover:text-slate-700"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
