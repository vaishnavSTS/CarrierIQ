import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierEquipment } from '../../../hooks/useCarrierEquipment'
import type { Signal } from '../../../types/carrierSignals'
import { formatDate } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../styles'

const PREVIEW_ROWS = 10

interface Related {
  usdot: number
  name: string | null
  vins: { vin: string; label: string; inspections: number; first: string; last: string }[]
  inspections: number
  first: string
  last: string
}

/** Other carriers connected to this one through shared equipment (spec 12.3, "Network"). */
export function RelationshipView({
  usdotNumber,
  signals,
  onOpenSignal,
}: {
  usdotNumber: number
  signals: Signal[]
  onOpenSignal: (id: number) => void
}) {
  const { data, error, isPending } = useCarrierEquipment(usdotNumber)
  const [showAll, setShowAll] = useState(false)
  const [openUsdot, setOpenUsdot] = useState<number | null>(null)

  const related = useMemo(() => {
    const byUsdot = new Map<number, Related>()
    for (const v of data?.vehicles ?? []) {
      const label = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Not identified'
      for (const c of v.other_carriers) {
        const row = byUsdot.get(c.usdot_number) ?? {
          usdot: c.usdot_number,
          name: c.legal_name,
          vins: [],
          inspections: 0,
          first: c.first_seen,
          last: c.last_seen,
        }
        row.vins.push({
          vin: v.vin,
          label,
          inspections: c.inspections,
          first: c.first_seen,
          last: c.last_seen,
        })
        row.inspections += c.inspections
        if (c.first_seen < row.first) row.first = c.first_seen
        if (c.last_seen > row.last) row.last = c.last_seen
        byUsdot.set(c.usdot_number, row)
      }
    }
    return [...byUsdot.values()].sort(
      (a, b) => b.vins.length - a.vins.length || b.last.localeCompare(a.last),
    )
  }, [data])
  const signalFor = new Map(signals.map((s) => [s.signal_key, s]))

  return (
    <section className="mt-8">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">Relationships</h3>
      <p className="mb-3 text-xs text-slate-500">
        Other USDOT numbers whose inspections recorded the same vehicles (VINs). Equipment
        legitimately moves between carriers through leases, rentals and sales, so a relationship is
        context for review, not a finding.
      </p>
      {isPending && <p className="text-sm text-slate-500">Loading relationships…</p>}
      {error && (
        <p className="text-sm text-red-700">Could not load relationships: {error.message}</p>
      )}
      {data && related.length === 0 && (
        <p className="text-sm text-slate-500">
          No other carrier’s inspections recorded this carrier’s vehicles.
        </p>
      )}
      {related.length > 0 && (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Carrier</th>
                <th className={`${cellClass} text-right`}>Shared vehicles</th>
                <th className={`${cellClass} text-right`}>Their inspections</th>
                <th className={cellClass}>Seen with them</th>
                <th className={cellClass}>Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(showAll ? related : related.slice(0, PREVIEW_ROWS)).map((r) => {
                const signal = signalFor.get(`shared_vin:${r.usdot}`)
                const open = openUsdot === r.usdot
                return (
                  <Fragment key={r.usdot}>
                    <tr>
                      <td className={cellClass}>
                        <Link
                          to={`/carriers/${r.usdot}`}
                          className="font-mono text-slate-900 underline hover:text-slate-600"
                        >
                          USDOT {r.usdot}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {r.name ?? 'Not loaded in CarrierIQ yet'}
                        </div>
                      </td>
                      <td className={`${cellClass} text-right`}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenUsdot(open ? null : r.usdot)}
                          className="tabular-nums text-slate-900 underline hover:text-slate-600"
                        >
                          {r.vins.length} {open ? '▴' : '▾'}
                        </button>
                      </td>
                      <td className={`${cellClass} text-right tabular-nums`}>{r.inspections}</td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {r.first === r.last
                          ? formatDate(r.first)
                          : `${formatDate(r.first)} – ${formatDate(r.last)}`}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {signal ? (
                          <button
                            type="button"
                            onClick={() => onOpenSignal(signal.id)}
                            className="flex items-center gap-2 text-xs text-slate-900 underline hover:text-slate-600"
                          >
                            {signal.confidence.toLowerCase()} confidence
                            {signal.status !== 'OPEN' && (
                              <StatusBadge label={signal.status.toLowerCase()} tone="pending" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-3 py-2">
                          <ul className="space-y-1 text-xs text-slate-700">
                            {r.vins.map((v) => (
                              <li key={v.vin}>
                                <span className="font-mono">{v.vin}</span> · {v.label} ·{' '}
                                {v.inspections} inspection{v.inspections === 1 ? '' : 's'} with
                                them, {formatDate(v.first)}
                                {v.first !== v.last && ` – ${formatDate(v.last)}`}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {!showAll && related.length > PREVIEW_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 text-xs text-slate-600 underline hover:text-slate-900"
            >
              Show all {related.length}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
