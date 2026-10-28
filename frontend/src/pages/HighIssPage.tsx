import { useQuery } from '@tanstack/react-query'
import { Download, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { apiGet } from '../api/client'
import { cellClass, headClass, tableClass } from '../features/carrier-profile/styles'

interface HighIssCarrier {
  usdot_number: number
  legal_name: string | null
  dba_name: string | null
  phone: string | null
  location: string | null
  fleet_size: number | null
  iss: number
  band: string | null
  score_since: string
}

interface HighIss {
  min_score: number
  data_month: string | null
  carriers: HighIssCarrier[]
}

const month = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'

/** Red from 90, amber below: how bad the score is at a glance. */
function scoreClass(iss: number): string {
  return iss >= 90
    ? 'bg-red-50 text-red-800 ring-red-200'
    : 'bg-amber-50 text-amber-800 ring-amber-200'
}

/**
 * STS: carriers whose latest Estimated ISS is 75 or higher (or another threshold), worst first,
 * with a phone to call. It follows the monthly ISS recalculation on its own; also as Excel.
 */
export function HighIssPage() {
  const [minScore, setMinScore] = useState(75)
  const { data, isPending, error } = useQuery({
    queryKey: ['iss', 'high', minScore],
    queryFn: () => apiGet<HighIss>(`/iss/high?min_score=${minScore}`),
  })

  const rows = data?.carriers ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">High Safety Score</h1>
          <p className="mt-1 text-sm text-slate-600">
            Carriers whose latest Estimated ISS is {minScore} or higher, worst first. Updated each
            month when ISS is recalculated
            {data?.data_month && <> (FMCSA data: {month(data.data_month)})</>}.
          </p>
        </div>
        <a
          href={`/api/v1/iss/high.xlsx?min_score=${minScore}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover sm:min-h-0"
        >
          <Download className="size-4" aria-hidden />
          Download Excel
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label htmlFor="iss-min" className="block text-xs font-medium text-slate-600">
            ISS at least
          </label>
          <input
            id="iss-min"
            type="number"
            min={1}
            max={100}
            value={minScore}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n >= 1 && n <= 100) setMinScore(n)
            }}
            className="mt-1 w-24 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5"
          />
        </div>
        {data && (
          <span className="pb-1.5 text-slate-600">
            {rows.length} {rows.length === 1 ? 'carrier' : 'carriers'}
          </span>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load the list: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">
          No carriers with an Estimated ISS of {minScore} or higher.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>ISS</th>
                <th className={cellClass}>Carrier</th>
                <th className={cellClass}>USDOT</th>
                <th className={cellClass}>Phone</th>
                <th className={cellClass}>Location</th>
                <th className={`${cellClass} text-right`}>Trucks</th>
                <th className={cellClass}>Score since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.usdot_number} className="border-t border-slate-100">
                  <td className={cellClass}>
                    <span
                      className={`inline-block min-w-10 rounded-md px-2 py-0.5 text-center font-semibold tabular-nums ring-1 ring-inset ${scoreClass(c.iss)}`}
                    >
                      {c.iss}
                    </span>
                  </td>
                  <td className={cellClass}>
                    <Link
                      to={`/carriers/${c.usdot_number}`}
                      className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                    >
                      {c.legal_name ?? `USDOT ${c.usdot_number}`}
                    </Link>
                    {c.dba_name && <div className="text-xs text-slate-600">DBA {c.dba_name}</div>}
                  </td>
                  <td className={`${cellClass} font-mono`}>{c.usdot_number}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone.replace(/\D/g, '')}`}
                        className="inline-flex items-center gap-1 text-accent-strong hover:underline"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className={cellClass}>{c.location ?? '—'}</td>
                  <td className={`${cellClass} text-right tabular-nums`}>{c.fleet_size ?? '—'}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>{month(c.score_since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
