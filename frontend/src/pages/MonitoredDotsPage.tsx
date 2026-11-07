import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { cellClass, headClass, tableClass } from '../features/carrier-profile/styles'
import { useAddMonitored, useMonitored, useRemoveMonitored } from '../hooks/useMonitored'
import { formatDateTime } from '../utils/format'

const button =
  'inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 sm:min-h-0'

/**
 * STS admins: the USDOT numbers they monitor, one list shared by every admin. Adding a number
 * loads the carrier from FMCSA, so its company name shows and its Safety Score Report opens.
 */
export function MonitoredDotsPage() {
  const { data, isPending, error } = useMonitored()
  const add = useAddMonitored()
  const [usdot, setUsdot] = useState('')
  const [added, setAdded] = useState<string | null>(null)

  const digits = usdot.replace(/\D/g, '')
  const rows = data ?? []

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!digits) return
    setAdded(null)
    add.mutate(Number(digits), {
      onSuccess: (row) => {
        setUsdot('')
        setAdded(`${row.legal_name ?? `USDOT ${row.usdot_number}`} is now monitored.`)
      },
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Monitored DOTs</h1>
        <p className="mt-1 text-sm text-slate-600">
          USDOT numbers STS admins keep an eye on. Every admin sees the same list.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-surface p-4"
      >
        <div>
          <label htmlFor="monitor-usdot" className="block text-xs font-medium text-slate-600">
            USDOT number
          </label>
          <input
            id="monitor-usdot"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 2465630"
            value={usdot}
            onChange={(e) => {
              setUsdot(e.target.value)
              add.reset()
            }}
            className="mt-1 w-48 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!digits || add.isPending}
          className={`${button} bg-cta text-cta-ink hover:bg-cta-hover`}
        >
          {add.isPending ? 'Adding…' : 'Add DOT'}
        </button>
        {add.error ? (
          <p role="alert" className="w-full text-sm text-red-700">
            {add.error.message}
          </p>
        ) : added ? (
          <p role="status" className="w-full text-sm text-emerald-700">
            {added}
          </p>
        ) : null}
      </form>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">Could not load the list: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-600">
          No DOTs monitored yet. Add one above.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-surface">
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={cellClass}>Company name</th>
                <th className={cellClass}>USDOT</th>
                <th className={cellClass}>Added on</th>
                <th className={cellClass}>Added by</th>
                <th className={cellClass}>Report</th>
                <th className={cellClass}>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.usdot_number} className="border-t border-slate-100">
                  <td className={cellClass}>
                    <Link
                      to={`/carriers/${row.usdot_number}`}
                      className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                    >
                      {row.legal_name ?? `USDOT ${row.usdot_number}`}
                    </Link>
                    {row.dba_name && (
                      <div className="text-xs text-slate-600">DBA {row.dba_name}</div>
                    )}
                  </td>
                  <td className={`${cellClass} font-mono`}>{row.usdot_number}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {formatDateTime(row.added_at)}
                  </td>
                  <td className={cellClass}>{row.added_by ?? '—'}</td>
                  <td className={cellClass}>
                    <Link
                      to={`/carriers/${row.usdot_number}?tab=safety-score-report`}
                      className={`${button} whitespace-nowrap border border-accent text-accent-strong hover:bg-accent-soft`}
                    >
                      View report
                    </Link>
                  </td>
                  <td className={`${cellClass} text-right`}>
                    <RemoveButton usdot={row.usdot_number} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Asks once more before taking a DOT off the list. */
function RemoveButton({ usdot }: { usdot: number }) {
  const remove = useRemoveMonitored()
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-50`}
      >
        Remove
      </button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {remove.error && <span className="text-xs text-red-700">{remove.error.message}</span>}
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.mutate(usdot)}
        className={`${button} bg-red-700 text-white hover:bg-red-800`}
      >
        {remove.isPending ? 'Removing…' : 'Yes, remove'}
      </button>
      <button
        type="button"
        onClick={() => {
          setAsking(false)
          remove.reset()
        }}
        className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-50`}
      >
        Cancel
      </button>
    </span>
  )
}
