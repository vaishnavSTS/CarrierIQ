import { Columns3, Plus, Trophy, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { bestOnRow, COMPARE_ROWS } from '../features/compare/compareRows'
import { MAX_COMPARE, parseUsdots, useCompareList } from '../features/compare/compareContext'
import { useComparison, type CarrierFacts } from '../features/compare/useComparison'

/**
 * Broker portal: up to three carriers side by side (/broker/compare?usdot=1,2,3). The URL holds
 * the carriers so a comparison can be shared; the best value on each ranked line is highlighted.
 */
export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const compare = useCompareList()
  const fromUrl = parseUsdots(params.get('usdot'))
  const usdots = fromUrl.length ? fromUrl : (compare?.usdots ?? [])
  const facts = useComparison(usdots)
  const reduce = useReducedMotion()

  // Keep the selection (bottom bar, Compare buttons) and the URL showing the same carriers.
  const key = usdots.join(',')
  useEffect(() => {
    if (params.get('usdot') !== key && key) setParams({ usdot: key }, { replace: true })
    compare?.replace(key ? key.split(',').map(Number) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on the carrier list only
  }, [key])

  function setList(next: number[]) {
    setParams(next.length ? { usdot: next.join(',') } : {}, { replace: true })
    compare?.replace(next)
  }

  const best = COMPARE_ROWS.map((row) => bestOnRow(row, facts))
  const ranked = best.filter((b) => b.length > 0).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <Columns3 className="size-5 text-accent-strong" aria-hidden />
            Compare carriers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Up to {MAX_COMPARE} carriers side by side, from the same FMCSA records as each profile.
            The best value on each line is highlighted.
          </p>
        </div>
        {usdots.length < MAX_COMPARE && (
          <AddCarrier onAdd={(u) => setList([...usdots, u])} existing={usdots} />
        )}
      </div>

      {usdots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-surface p-8 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-900">No carriers to compare yet</p>
          <p className="mt-1">
            Add a USDOT number above, or{' '}
            <Link to="/broker" className="font-medium text-accent-strong hover:underline">
              search for carriers
            </Link>{' '}
            and press <span className="font-medium">Compare</span> on each one.
          </p>
        </div>
      ) : (
        <>
          <Summary facts={facts} best={best} ranked={ranked} />

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface">
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <colgroup>
                <col className="w-48" />
                {usdots.map((u) => (
                  <col key={u} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 align-top">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    Carrier
                  </th>
                  {facts.map((f, i) => (
                    <motion.th
                      key={f.usdot}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                      className="px-4 py-3 text-left font-normal"
                    >
                      <CarrierHeading
                        facts={f}
                        onRemove={() => setList(usdots.filter((u) => u !== f.usdot))}
                      />
                    </motion.th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARE_ROWS.map((row, r) => (
                  <tr key={row.key} className="align-top">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="font-medium text-slate-800">{row.label}</span>
                      {row.hint && <span className="block text-xs text-slate-500">{row.hint}</span>}
                    </th>
                    {facts.map((f, i) => {
                      const isBest = best[r].includes(i)
                      return (
                        <td
                          key={f.usdot}
                          className={`px-4 py-3 text-slate-800 ${isBest ? 'bg-emerald-50' : ''}`}
                        >
                          <Cell facts={f} value={row.value(f)} />
                          {isBest && (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <Trophy className="size-3" aria-hidden />
                              Best
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            The Estimated ISS is CarrierIQ’s estimate of FMCSA’s Inspection Selection System score,
            not an FMCSA figure. Open a carrier for the source and date of every value.
          </p>
        </>
      )}
    </div>
  )
}

function Cell({ facts, value }: { facts: CarrierFacts; value: ReactNode | undefined }) {
  if (facts.profileError) return <span className="text-slate-400">—</span>
  if (value === undefined) {
    return (
      <span
        className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200"
        aria-label="Loading"
      />
    )
  }
  return <div>{value}</div>
}

function CarrierHeading({ facts, onRemove }: { facts: CarrierFacts; onRemove: () => void }) {
  const notFound = facts.profileError instanceof ApiError && facts.profileError.status === 404
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        {facts.profile ? (
          <Link
            to={`/broker/carriers/${facts.usdot}`}
            className="font-semibold text-slate-900 hover:underline"
          >
            {facts.profile.legal_name}
          </Link>
        ) : facts.profileError ? (
          <span className="text-red-700">
            {notFound ? 'Not found in FMCSA data' : 'Couldn’t load this carrier'}
          </span>
        ) : (
          <span className="text-slate-500">Loading from FMCSA…</span>
        )}
        <span className="block font-mono text-xs text-slate-500">USDOT {facts.usdot}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Remove USDOT ${facts.usdot} from the comparison`}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

/** Which carrier comes out ahead on the most ranked lines, in plain words; facts, no verdict. */
function Summary({
  facts,
  best,
  ranked,
}: {
  facts: CarrierFacts[]
  best: number[][]
  ranked: number
}) {
  if (facts.length < 2) {
    return (
      <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600">
        Add at least one more carrier to see how they compare.
      </p>
    )
  }
  const loading = facts.some((f) => !f.profileError && (!f.profile || !f.safety || !f.network))
  if (loading) {
    return (
      <p
        className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600"
        role="status"
      >
        Loading… a carrier not yet in CarrierIQ is fetched from FMCSA first, which can take a few
        seconds.
      </p>
    )
  }
  const wins = facts.map((_, i) => best.filter((b) => b.includes(i) && b.length === 1).length)
  const top = Math.max(...wins)
  const leaders = facts.filter((_, i) => wins[i] === top)
  const name = (f: CarrierFacts) => f.profile?.legal_name ?? `USDOT ${f.usdot}`
  const warnings = facts.filter((f) => f.profile && f.profile.authority.status !== 'ACTIVE')

  return (
    <div className="space-y-2 rounded-xl border border-accent-soft bg-accent-soft/40 px-4 py-3 text-sm text-slate-800">
      <p>
        {top === 0 ? (
          'The carriers are level on every ranked line.'
        ) : leaders.length === 1 ? (
          <>
            <span className="font-semibold">{name(leaders[0])}</span> comes out ahead on {top} of{' '}
            {ranked} ranked lines.
          </>
        ) : (
          <>
            Close: {leaders.map(name).join(' and ')} each come out ahead on {top} of {ranked} ranked
            lines.
          </>
        )}
      </p>
      {warnings.map((f) => (
        <p key={f.usdot} className="text-amber-700">
          {name(f)}’s operating authority is{' '}
          {f.profile?.authority.status?.toLowerCase() ?? 'not on file'}: check it before booking a
          load.
        </p>
      ))}
    </div>
  )
}

function AddCarrier({ onAdd, existing }: { onAdd: (usdot: number) => void; existing: number[] }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const usdot = Number(value.trim())
    if (!Number.isInteger(usdot) || usdot <= 0) {
      setError('Enter a USDOT number')
      return
    }
    if (existing.includes(usdot)) {
      setError('Already in the comparison')
      return
    }
    onAdd(usdot)
    setValue('')
    setError(null)
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          placeholder="USDOT number"
          aria-label="USDOT number to add"
          className="w-40 rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong"
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  )
}
