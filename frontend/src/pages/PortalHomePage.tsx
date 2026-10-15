import { ChevronRight, Clock, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CarrierSnapshot } from '../features/portal/CarrierSnapshot'
import { ClientGuide } from '../features/portal/ClientGuide'
import { PortalHero } from '../features/portal/PortalHero'
import { usePortalOverview, useMe } from '../hooks/useAuth'
import { formatDateTime } from '../utils/format'

/**
 * Client portal home: each of the organization's carriers as it stands right now (safety score,
 * what a broker's check would flag, registration checks), then what CarrierIQ does for them.
 */
export function PortalHomePage() {
  const { data: user } = useMe()
  const { data, isPending, isError } = usePortalOverview()

  return (
    <div className="space-y-8">
      <PortalHero
        firstName={user?.full_name.split(' ')[0]}
        organizationName={data?.organization_name}
        carriers={data?.carriers}
      />

      {data?.carriers.map((c) => (
        <CarrierSnapshot key={c.usdot_number} usdotNumber={c.usdot_number} />
      ))}

      {/* With one carrier the snapshot above already links to it. */}
      {data?.carriers.length !== 1 && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-5">
          <h2 className="text-sm font-semibold text-slate-900">My carriers</h2>
          {isPending && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
          {isError && (
            <p className="mt-3 text-sm text-red-700">
              Couldn’t load your carriers. Try again shortly.
            </p>
          )}
          {data && data.carriers.length === 0 && (
            <div className="mt-3 flex items-start gap-3 text-sm text-slate-600">
              <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              <p>No carriers linked to your account yet. Contact STS to add your USDOT number.</p>
            </div>
          )}
          {data && data.carriers.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.carriers.map((c) => (
                <li key={c.usdot_number}>
                  <Link
                    to={`/portal/carriers/${c.usdot_number}`}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
                      <Truck className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {c.legal_name ?? 'Details not loaded yet'}
                        {c.dba_name && <span className="text-slate-500"> · DBA {c.dba_name}</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        USDOT <span className="font-mono">{c.usdot_number}</span>
                        {c.registration_status && <> · {c.registration_status}</>}
                        {c.last_refreshed_at && (
                          <> · FMCSA data as of {formatDateTime(c.last_refreshed_at)}</>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className="ml-auto size-4 shrink-0 text-slate-400 group-hover:text-slate-700"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ClientGuide />
    </div>
  )
}
