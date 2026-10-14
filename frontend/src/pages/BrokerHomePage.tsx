import { BadgeCheck, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { CarrierSearchBox } from '../features/carrier-search/CarrierSearchBox'
import { CarrierSearchResults } from '../features/carrier-search/CarrierSearchResults'
import { useBrokerOverview, useMe } from '../hooks/useAuth'
import { useCarrierSearch } from '../hooks/useCarrierSearch'
import type { SearchKind } from '../types/carrier'
import { formatDate } from '../utils/format'

const KIND_LABEL: Record<SearchKind, string> = {
  usdot: 'USDOT number',
  docket: 'docket number',
  name: 'carrier name',
}

const SOURCE_LABEL: Record<string, string> = {
  MOTUS: 'FMCSA Motus',
  LEGACY_LI: 'FMCSA L&I',
}

/** Broker portal home: their brokerage, and carrier search (?q=…) to vet any carrier. */
export function BrokerHomePage() {
  const { data: user } = useMe()
  const { data: brokerage } = useBrokerOverview()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const { data, error, isFetching } = useCarrierSearch(query)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-surface p-6">
        <p className="text-sm text-slate-500">
          Welcome{user ? `, ${user.full_name.split(' ')[0]}` : ''}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          {brokerage?.organization_name ?? user?.organization_name ?? 'Your brokerage'}
        </h1>
        {brokerage && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
            Broker authority confirmed with{' '}
            {SOURCE_LABEL[brokerage.authority_source ?? ''] ?? 'FMCSA'}
            {brokerage.docket_number && (
              <span className="font-mono text-slate-900">{brokerage.docket_number}</span>
            )}
            {brokerage.usdot_number && (
              <span className="font-mono text-slate-900">· USDOT {brokerage.usdot_number}</span>
            )}
            {brokerage.authority_checked_at && (
              <span className="text-slate-500">
                · checked {formatDate(brokerage.authority_checked_at)}
              </span>
            )}
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Search className="size-4 text-accent-strong" aria-hidden />
          Vet a carrier
        </h2>
        {/* key: reset the box when the URL query changes (e.g. back button) */}
        <CarrierSearchBox key={query} initialQuery={query} autoFocus={!query} />

        {!query && (
          <p className="text-sm text-slate-500">
            Search by USDOT, MC number or name. Each carrier opens with its FMCSA authority,
            insurance, safety record and Estimated ISS, registration checks, and a packet you can
            keep on file.
          </p>
        )}
        {isFetching && (
          <p className="text-sm text-slate-600" role="status">
            Searching… a carrier not yet in CarrierIQ is loaded from FMCSA first, which can take a
            few seconds.
          </p>
        )}
        {error && !isFetching && (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error instanceof ApiError && error.status === 422
              ? error.message
              : `Search failed: ${error.message}`}
          </div>
        )}
        {data && !isFetching && (
          <>
            <p className="text-sm text-slate-600">
              {data.results.length === 0
                ? `No carrier found for ${KIND_LABEL[data.query_type]} “${data.query}”.`
                : `${data.results.length} result${data.results.length === 1 ? '' : 's'} for ${KIND_LABEL[data.query_type]} “${data.query}”.`}
            </p>
            {data.results.length > 0 && <CarrierSearchResults results={data.results} />}
          </>
        )}
      </section>
    </div>
  )
}
