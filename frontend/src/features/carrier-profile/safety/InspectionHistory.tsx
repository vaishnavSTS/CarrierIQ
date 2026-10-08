import { Fragment, useState } from 'react'

import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierInspections } from '../../../hooks/useCarrierSafety'
import type { InspectionDetail } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../styles'

const PAGE_SIZE = 25

function OosFlag({ value }: { value: boolean }) {
  return value ? <StatusBadge label="OOS" tone="down" /> : <span className="text-slate-400">—</span>
}

function Violations({ inspection }: { inspection: InspectionDetail }) {
  if (inspection.violations.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {inspection.violation_count > 0
          ? `The report counts ${inspection.violation_count} violation(s), but FMCSA’s violation file has no details for them.`
          : 'No violations on this inspection.'}
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {inspection.violations.map((v, i) => (
        <li key={`${v.code}-${i}`} className="flex gap-3 text-sm">
          <span className="w-16 shrink-0 text-xs text-slate-500">
            {v.applies_to === 'DRIVER'
              ? 'Driver'
              : v.unit_number
                ? `Unit ${v.unit_number}`
                : 'Vehicle'}
          </span>
          <span className="flex-1">
            <span className="text-slate-900">{v.description ?? '—'}</span>{' '}
            <span className="font-mono text-xs text-slate-500">{v.code}</span>
            {v.citation_number && (
              <span className="ml-2 text-xs text-slate-500">Citation {v.citation_number}</span>
            )}
          </span>
          {v.out_of_service && <StatusBadge label="OOS" tone="down" />}
        </li>
      ))}
    </ul>
  )
}

export function InspectionHistory({ usdotNumber }: { usdotNumber: number }) {
  const [page, setPage] = useState(1)
  const [oosOnly, setOosOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const { data, error, isPending, isPlaceholderData } = useCarrierInspections(
    usdotNumber,
    page,
    PAGE_SIZE,
    oosOnly,
  )

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const first = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const lastShown = data ? Math.min(page * PAGE_SIZE, data.total) : 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={oosOnly}
            onChange={(event) => {
              setOosOnly(event.target.checked)
              setPage(1)
            }}
          />
          Out-of-service inspections only
        </label>
        {data && (
          <span className="text-xs text-slate-500">
            {data.total === 0
              ? 'No inspections'
              : `Showing ${first}–${lastShown} of ${data.total.toLocaleString()}`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-700">Could not load inspections: {error.message}</p>}
      {isPending && <p className="text-sm text-slate-500">Loading inspections…</p>}

      {data && data.total > 0 && (
        <div className={`overflow-x-auto ${isPlaceholderData ? 'opacity-60' : ''}`}>
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Date</th>
                <th className={cellClass}>Level</th>
                <th className={cellClass}>Location</th>
                <th className={cellClass}>VIN</th>
                <th className={`${cellClass} text-right`}>Violations</th>
                <th className={cellClass}>Vehicle</th>
                <th className={cellClass}>Driver</th>
                <th className={cellClass}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.inspections.map((i) => {
                const expanded = open === i.inspection_id
                return (
                  <Fragment key={i.inspection_id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setOpen(expanded ? null : i.inspection_id)}
                    >
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {formatDate(i.inspection_date)}
                      </td>
                      <td className={cellClass}>{i.level ?? '—'}</td>
                      <td className={cellClass}>{i.location ?? i.state ?? '—'}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{i.vin ?? '—'}</td>
                      <td className={`${cellClass} text-right tabular-nums`}>
                        {i.violation_count}
                      </td>
                      <td className={cellClass}>
                        <OosFlag value={i.vehicle_oos} />
                      </td>
                      <td className={cellClass}>
                        <OosFlag value={i.driver_oos} />
                      </td>
                      <td className={`${cellClass} text-right`}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Hide' : 'Show'} violations for inspection ${i.inspection_id}`}
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-3 py-3">
                          <div className="mb-2 text-xs text-slate-500">
                            Inspection {i.inspection_id}
                          </div>
                          <Violations inspection={i} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            ← Newer
          </button>
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  )
}
