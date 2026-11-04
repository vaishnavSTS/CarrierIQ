import { ArrowRight, ChevronRight, FilePlus2, FileSearch } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import { useDataQsCasePath, useDataQsCases } from '../../../hooks/useDataQs'
import { formatDate } from '../../../utils/format'
import { WORK_STATUS } from '../../dataqs/labels'
import { CARD, LABEL, useReveal } from './ui'

const SHOWN = 4

/**
 * Portal home: the company's open DataQs requests with their status and next step (the ones
 * waiting on the carrier first), and where to start one. The full list is on the DataQs page.
 */
export function DataQsPanel({ multipleCarriers }: { multipleCarriers: boolean }) {
  const { data, isPending, isError } = useDataQsCases()
  const casePath = useDataQsCasePath()
  const reveal = useReveal()
  const cases = data?.cases ?? []
  const open = cases
    .filter((c) => c.work_status !== 'CLOSED')
    .sort((a, b) => Number(b.action_owner === 'CARRIER') - Number(a.action_owner === 'CARRIER'))
  const waiting = open.filter((c) => c.action_owner === 'CARRIER').length
  const closed = cases.length - open.length

  return (
    <motion.section {...reveal()} className={CARD} aria-labelledby="portal-dataqs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
            <FileSearch className="size-5" aria-hidden />
          </span>
          <div>
            <div className={`${LABEL} text-slate-500`}>DataQs requests</div>
            <h2 id="portal-dataqs" className="text-lg font-semibold leading-tight text-slate-950">
              {isPending
                ? 'Loading your requests…'
                : open.length === 0
                  ? 'No open requests'
                  : `${open.length} open request${open.length === 1 ? '' : 's'}`}
            </h2>
            {(waiting > 0 || closed > 0) && (
              <p className="text-sm text-slate-600">
                {waiting > 0 && (
                  <span className="font-medium text-amber-700">{waiting} waiting on you</span>
                )}
                {waiting > 0 && closed > 0 && ' · '}
                {closed > 0 && `${closed} closed`}
              </p>
            )}
          </div>
        </div>
        <Link
          to="/portal/dataqs#start-request"
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-[#060d24] shadow-sm hover:bg-amber-400"
        >
          <FilePlus2 className="size-4" aria-hidden />
          Start a request · $50 per inspection
        </Link>
      </div>

      {isError && (
        <p className="mt-4 text-sm text-red-700">Couldn’t load your requests. Try again shortly.</p>
      )}

      {!isPending && !isError && open.length === 0 && (
        <p className="mt-4 text-sm text-slate-600">
          Believe an inspection or violation on your record is wrong? STS can prepare and file a
          DataQs request with FMCSA on your behalf and track it to a decision.
        </p>
      )}

      {open.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {open.slice(0, SHOWN).map((c) => (
            <li key={c.id}>
              <Link
                to={casePath(c.id)}
                className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">Case {c.id}</span>
                    <StatusBadge {...WORK_STATUS[c.work_status]} />
                    {c.action_owner === 'CARRIER' && (
                      <StatusBadge label="Waiting on you" tone="warn" />
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {multipleCarriers && c.carrier_name && <>{c.carrier_name} · </>}
                    Inspection {formatDate(c.event_date)}
                    {c.event_state && `, ${c.event_state}`}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{c.next_action}</p>
                </div>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-slate-700"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cases.length > 0 && (
        <Link
          to="/portal/dataqs"
          className="tap mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
        >
          {open.length > SHOWN ? `All ${cases.length} requests` : 'All requests'}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </motion.section>
  )
}
