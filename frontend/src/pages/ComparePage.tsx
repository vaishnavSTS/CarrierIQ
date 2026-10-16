import { Ban, Columns3, Plus, Trophy, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import {
  bestOnRow,
  bestPick,
  COMPARE_ROWS,
  type CarrierPick,
} from '../features/compare/compareRows'
import { MAX_COMPARE, parseUsdots, useCompareList } from '../features/compare/compareContext'
import { useComparison, type CarrierFacts } from '../features/compare/useComparison'
import { useCarrierPath, useSearchPath } from '../hooks/usePortalMode'

/**
 * Broker and STS portals: up to three carriers side by side (/broker/compare or /compare,
 * ?usdot=1,2,3). The URL holds
 * the carriers so a comparison can be shared; the best value on each ranked line is highlighted.
 */
export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const compare = useCompareList()
  const fromUrl = parseUsdots(params.get('usdot'))
  const usdots = fromUrl.length ? fromUrl : (compare?.usdots ?? [])
  const facts = useComparison(usdots)
  const reduce = useReducedMotion()
  const searchPath = useSearchPath()

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
  const picks = bestPick(facts)

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
            <Link to={searchPath} className="font-medium text-accent-strong hover:underline">
              search for carriers
            </Link>{' '}
            and press <span className="font-medium">Compare</span> on each one.
          </p>
        </div>
      ) : (
        <>
          <Summary facts={facts} picks={picks} />

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
                        pick={picks?.[i] ?? null}
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

function CarrierHeading({
  facts,
  pick,
  onRemove,
}: {
  facts: CarrierFacts
  pick: CarrierPick | null
  onRemove: () => void
}) {
  const carrierPath = useCarrierPath()
  const notFound = facts.profileError instanceof ApiError && facts.profileError.status === 404
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {facts.profile ? (
            <Link
              to={carrierPath(facts.usdot)}
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
      {pick && <PickBadge pick={pick} />}
    </div>
  )
}

/** Under each carrier's name: best pick, its place, or the must-pass check it fails. */
function PickBadge({ pick }: { pick: CarrierPick }) {
  if (pick.blocked) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs">
        <span className="flex items-center gap-1 font-semibold text-red-700">
          <Ban className="size-3.5" aria-hidden />
          Not recommended
        </span>
        <span className="block text-red-800">{pick.blocked}</span>
      </div>
    )
  }
  if (pick.rank === 1) {
    return (
      <div className="rounded-md border border-emerald-600/60 bg-emerald-50 px-2 py-1 text-xs">
        <span className="flex items-center gap-1 font-semibold text-emerald-700">
          <Trophy className="size-3.5" aria-hidden />
          Best pick
        </span>
        <span className="block text-slate-700">{pick.reason}</span>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
      <span className="font-semibold text-slate-800">#{pick.rank} choice</span>
      <span className="block text-slate-600">{pick.reason}</span>
    </div>
  )
}

/** The best pick in one line, why, and what rules the others out; the rule is spelled out below. */
function Summary({ facts, picks }: { facts: CarrierFacts[]; picks: CarrierPick[] | null }) {
  if (facts.length < 2) {
    return (
      <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600">
        Add at least one more carrier to see how they compare.
      </p>
    )
  }
  if (!picks) {
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
  const name = (f: CarrierFacts) => f.profile?.legal_name ?? `USDOT ${f.usdot}`
  const winners = facts.filter((_, i) => picks[i].rank === 1)
  const blocked = facts.flatMap((f, i) =>
    picks[i].blocked ? [[f, picks[i].blocked] as const] : [],
  )

  return (
    <div className="space-y-2 rounded-xl border border-accent-soft bg-accent-soft/40 px-4 py-3 text-sm text-slate-800">
      <p className="flex items-start gap-2">
        <Trophy className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        {winners.length === 0 ? (
          <span>
            <span className="font-semibold">No carrier here passes every must-pass check.</span> Add
            another carrier, or look into the items below.
          </span>
        ) : winners.length === 1 ? (
          <span>
            Best pick: <span className="font-semibold">{name(winners[0])}</span>.{' '}
            {picks[facts.indexOf(winners[0])].reason}
            {facts.length - blocked.length > 1 ? ', the best of the carriers that pass.' : '.'}
          </span>
        ) : (
          <span>
            Tied for best pick:{' '}
            <span className="font-semibold">{winners.map(name).join(' and ')}</span>. They are level
            on every ranking check; compare the lines below.
          </span>
        )}
      </p>
      {blocked.map(([f, reason]) => (
        <p key={f.usdot} className="text-amber-700">
          {name(f)}: {reason.charAt(0).toLowerCase() + reason.slice(1)}. Check it before booking a
          load.
        </p>
      ))}
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">
          How the best pick is chosen
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            <span className="font-medium text-slate-800">Must pass all:</span> operating authority
            active, liability insurance on file, no active FMCSA out-of-service order, safety rating
            not Unsatisfactory.
          </li>
          <li>
            <span className="font-medium text-slate-800">Then ranked by</span> the lowest Estimated
            ISS; ties go to fewer safety categories over threshold, then fewer broker flags, then
            the lower vehicle out-of-service rate.
          </li>
        </ol>
        <p className="mt-2">
          Based on public FMCSA records only. It doesn’t replace your own vetting: rates, lanes,
          equipment and your history with the carrier still count.
        </p>
      </details>
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
