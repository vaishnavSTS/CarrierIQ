import { AlertTriangle, ChevronRight, FilePlus2, Globe, Mail, Phone, Users } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { StatusBadge } from '../components/StatusBadge'
import { DataQsCaseList } from '../features/dataqs/DataQsCaseList'
import { DataQsIntro } from '../features/dataqs/DataQsIntro'
import { DataQsStartRequest } from '../features/dataqs/DataQsStartRequest'
import { WORK_STATUS } from '../features/dataqs/labels'
import { CARD, LABEL } from '../features/portal/carrier/ui'
import { useDataQsCasePath, useDataQsCases } from '../hooks/useDataQs'
import { formatDate, formatDateTime } from '../utils/format'

const CONTACT =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 hover:border-accent hover:text-accent-strong'

/**
 * Carrier portal DataQs: the price, the requests waiting on the carrier first, every request
 * with its status, and where to start a new one from an inspection.
 */
export function PortalDataQsPage() {
  const { data } = useDataQsCases()
  const casePath = useDataQsCasePath()
  const { hash } = useLocation()
  const cases = data?.cases ?? []
  // Explained up front until the company has a request of its own; then folded away.
  const hasRequests = cases.length > 0
  const open = cases.filter((c) => c.work_status !== 'CLOSED')
  const waiting = open.filter((c) => c.action_owner === 'CARRIER')

  // "Start a request" links from the home page land here with #start-request.
  useEffect(() => {
    if (hash === '#start-request') {
      document.getElementById('start-request')?.scrollIntoView({ block: 'start' })
    }
  }, [hash])

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <div className={`${LABEL} text-slate-500`}>Correct your record</div>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">DataQs requests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Believe an inspection or violation on your record is wrong? STS can prepare and file a
          DataQs request with FMCSA on your behalf and track it to a decision.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* The price, made hard to miss: each inspection challenged is its own $50 request. */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl brand-panel px-6 py-5 text-white shadow-lg shadow-violet-500/25 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">$50</span>
              <span className="text-lg font-semibold">per inspection</span>
            </p>
            <p className="mt-1 text-sm text-white/90">
              To file a DataQs request. Each inspection you challenge is billed separately.
            </p>
          </div>
          <a
            href="#start-request"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-base font-semibold text-[#060d24] shadow-md hover:bg-amber-400"
          >
            <FilePlus2 className="size-5" aria-hidden />
            Start a request
          </a>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          {(
            [
              ['Open', open.length, false],
              ['Waiting on you', waiting.length, waiting.length > 0],
              ['Closed', cases.length - open.length, false],
            ] as const
          ).map(([label, value, warn]) => (
            <div key={label} className={`${CARD} flex flex-col-reverse justify-end p-4`}>
              <dt className="mt-0.5 text-xs text-slate-500">{label}</dt>
              <dd
                className={`text-3xl font-semibold tabular-nums ${warn ? 'text-amber-700' : 'text-slate-950'}`}
              >
                {data ? value : '—'}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {waiting.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <AlertTriangle className="size-4 text-amber-700" aria-hidden />
            Waiting on you
          </h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {waiting.map((c) => (
              <li key={c.id}>
                <Link
                  to={casePath(c.id)}
                  className="group flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">Case {c.id}</span>
                      <StatusBadge {...WORK_STATUS[c.work_status]} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {c.carrier_name && <>{c.carrier_name} · </>}
                      Inspection {formatDate(c.event_date)}
                      {c.event_state && `, ${c.event_state}`}
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">{c.next_action}</p>
                    {c.next_deadline_at && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        {c.next_deadline_label ?? 'Due'}: {formatDateTime(c.next_deadline_at)}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-slate-400 group-hover:text-slate-700"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-950">Your requests</h2>
        <DataQsCaseList
          showCompany={false}
          empty="No requests yet. Start one from an inspection below."
        />
      </section>

      {/* 2 or more inspections: an STS specialist talks through the offers. */}
      <div
        className={`${CARD} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6`}
      >
        <p className="flex min-w-0 items-center gap-3 text-sm text-slate-700">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#101853] text-white">
            <Users className="size-4" aria-hidden />
          </span>
          <span>
            <span className="font-semibold text-slate-900">Filing 2 or more DataQs?</span> Contact a
            Sky Transport Solutions specialist about our offers.
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm font-medium lg:flex-nowrap">
          <a href="tel:+18004989820" className={CONTACT}>
            <Phone className="size-4" aria-hidden />
            (800) 498-9820
          </a>
          <a href="mailto:info@skytransportsolutions.com" className={CONTACT}>
            <Mail className="size-4" aria-hidden />
            info@skytransportsolutions.com
          </a>
          <a
            href="https://www.skytransportsolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={CONTACT}
          >
            <Globe className="size-4" aria-hidden />
            skytransportsolutions.com
          </a>
        </div>
      </div>

      <div id="start-request" className="scroll-mt-20">
        <DataQsStartRequest />
      </div>
      <DataQsIntro audience="carrier" folded={hasRequests} />
    </div>
  )
}
