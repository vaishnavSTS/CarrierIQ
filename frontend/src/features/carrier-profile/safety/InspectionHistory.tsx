import { Fragment, useEffect, useState, type ReactNode } from 'react'

import { StatusBadge } from '../../../components/StatusBadge'
import { useCarrierInspections } from '../../../hooks/useCarrierSafety'
import type { InspectionDetail } from '../../../types/carrierSafety'
import { formatDate } from '../../../utils/format'
import { cellClass, headClass, tableClass } from '../styles'
import { levelLabel } from './inspectionLevels'

const PAGE_SIZE = 25

function OosFlag({ value }: { value: boolean }) {
  return value ? (
    <StatusBadge label="Out of service" tone="down" />
  ) : (
    <span className="text-slate-500">No</span>
  )
}

function Violations({ inspection }: { inspection: InspectionDetail }) {
  if (inspection.violations.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {inspection.violation_count > 0
          ? `${inspection.violation_count} violation${inspection.violation_count === 1 ? '' : 's'} on the report; FMCSA has no details for ${inspection.violation_count === 1 ? 'it' : 'them'}.`
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
          {v.out_of_service && <StatusBadge label="Out of service" tone="down" />}
        </li>
      ))}
    </ul>
  )
}

/** `rowAction` adds a control to each row, e.g. DataQs' "Request data review". */
export function InspectionHistory({
  usdotNumber,
  rowAction,
}: {
  usdotNumber: number
  rowAction?: (inspection: InspectionDetail) => ReactNode
}) {
  const [page, setPage] = useState(1)
  const [oosOnly, setOosOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [state, setState] = useState('')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  // Search once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(typed.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [typed])
  const { data, error, isPending, isPlaceholderData } = useCarrierInspections(
    usdotNumber,
    page,
    PAGE_SIZE,
    oosOnly,
    { state, search },
  )
  const filtered = oosOnly || state !== '' || search !== ''

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const first = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const lastShown = data ? Math.min(page * PAGE_SIZE, data.total) : 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-700">
            <span className="sr-only">Search by report number</span>
            <input
              type="search"
              value={typed}
              maxLength={50}
              placeholder="Report number"
              onChange={(event) => setTyped(event.target.value)}
              className="w-40 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
            />
          </label>
          {data && data.states.length > 1 && (
            <label className="text-sm text-slate-700">
              <span className="sr-only">State</span>
              <select
                value={state}
                onChange={(event) => {
                  setState(event.target.value)
                  setPage(1)
                }}
                className="rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
              >
                <option value="">All states</option>
                {data.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        </div>
        {data && (
          <span className="text-xs text-slate-500">
            {data.total === 0
              ? filtered
                ? 'No inspections match'
                : 'No inspections'
              : `Showing ${first}–${lastShown} of ${data.total.toLocaleString()}`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-700">Could not load inspections: {error.message}</p>}
      {isPending && <p className="text-sm text-slate-500">Loading inspections…</p>}

      {/* Phones: one card per inspection; wider screens: the table */}
      {data && data.total > 0 && (
        <ul className={`space-y-3 sm:hidden ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {data.inspections.map((i) => {
            const expanded = open === i.inspection_id
            return (
              <li
                key={i.inspection_id}
                className="rounded-xl border border-slate-200 bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">
                      {formatDate(i.inspection_date)}
                      {i.state && ` · ${i.state}`}
                    </div>
                    <div className="text-xs text-slate-600">
                      {levelLabel(i.level)}
                      {i.location && ` · ${i.location}`}
                    </div>
                    <div className="font-mono text-xs text-slate-600">
                      Report {i.report_number ?? '—'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold tabular-nums text-slate-900">
                      {i.violation_count}
                    </div>
                    <div className="text-xs text-slate-600">
                      {i.violation_count === 1 ? 'violation' : 'violations'}
                    </div>
                  </div>
                </div>
                {(i.vehicle_oos || i.driver_oos) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.vehicle_oos && <StatusBadge label="Vehicle out of service" tone="down" />}
                    {i.driver_oos && <StatusBadge label="Driver out of service" tone="down" />}
                  </div>
                )}
                {i.vin && <div className="mt-1 font-mono text-xs text-slate-600">VIN {i.vin}</div>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : i.inspection_id)}
                    className="min-h-11 rounded-lg px-1 text-sm font-medium text-accent-strong"
                  >
                    {expanded ? 'Hide violations' : 'Show violations'}
                  </button>
                  {rowAction && <div>{rowAction(i)}</div>}
                </div>
                {expanded && (
                  <div className="mt-2 border-t border-slate-100 pt-3">
                    <Violations inspection={i} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {data && data.total > 0 && (
        <div
          className={`relative hidden overflow-x-auto sm:block ${isPlaceholderData ? 'opacity-60' : ''}`}
        >
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Date</th>
                <th className={cellClass}>State</th>
                <th className={cellClass}>Report number</th>
                <th className={cellClass}>Level</th>
                <th className={cellClass}>Location</th>
                <th className={cellClass}>VIN</th>
                <th className={`${cellClass} text-right`}>Violations</th>
                <th className={cellClass}>Vehicle out-of-service</th>
                <th className={cellClass}>Driver out-of-service</th>
                {rowAction && (
                  <th className={cellClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
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
                      <td className={cellClass}>{i.state ?? '—'}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{i.report_number ?? '—'}</td>
                      <td className={`${cellClass} whitespace-nowrap`}>{levelLabel(i.level)}</td>
                      <td className={cellClass}>{i.location ?? '—'}</td>
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
                      {rowAction && (
                        // Clicks here act on the control, not the row's expand toggle.
                        <td className={cellClass} onClick={(e) => e.stopPropagation()}>
                          {rowAction(i)}
                        </td>
                      )}
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
                        <td colSpan={rowAction ? 11 : 10} className="px-3 py-3">
                          <div className="mb-2 text-xs text-slate-500">
                            {i.report_number && `Report ${i.report_number} · `}FMCSA inspection ID{' '}
                            {i.inspection_id}
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
