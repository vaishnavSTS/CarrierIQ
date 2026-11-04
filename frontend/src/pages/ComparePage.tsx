import { Check, Columns3, Link2, MapPin, Plus, Search, Trophy, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { bestOnRow, COMPARE_ROWS, type CompareRow } from '../features/compare/compareRows'
import { MAX_COMPARE, parseUsdots, useCompareList } from '../features/compare/compareContext'
import { useComparison, type CarrierFacts } from '../features/compare/useComparison'
import { HowWeDecide, VerdictCard, VerdictSummary } from '../features/compare/VerdictPanels'
import { rankCarriers, vetCarrier, type Ranked } from '../features/compare/vetting'
import { useMe } from '../hooks/useAuth'
import { useCarrierPath, useSearchPath } from '../hooks/usePortalMode'

const LABEL = 'font-label text-[10.5px] font-semibold uppercase tracking-[0.14em]'

/** The comparison's lines, grouped the way a broker reads them. Rows not named here go last. */
const GROUPS: [title: string, keys: string[]][] = [
  ['Authority and insurance', ['authority', 'insurance', 'renewal', 'age']],
  [
    'Safety record',
    ['iss', 'basics', 'vehicle-oos', 'driver-oos', 'crashes', 'inspections', 'rating'],
  ],
  ['Red flags', ['flags']],
  ['About the carrier', ['fleet', 'location', 'refreshed']],
]

function groupRows(): [string, CompareRow[]][] {
  const named = new Set(GROUPS.flatMap(([, keys]) => keys))
  const groups = GROUPS.map(
    ([title, keys]) =>
      [title, keys.flatMap((k) => COMPARE_ROWS.filter((row) => row.key === k))] as [
        string,
        CompareRow[],
      ],
  )
  const rest = COMPARE_ROWS.filter((row) => !named.has(row.key))
  if (rest.length) groups.push(['Other', rest])
  return groups.filter(([, rows]) => rows.length > 0)
}

const GROUPED = groupRows()

/**
 * Broker and STS portals: up to three carriers side by side (/broker/compare or /compare,
 * ?usdot=1,2,3). The URL holds the carriers so a comparison can be shared. Each carrier gets a
 * card with its booking check verdict; the table below highlights the best value on each ranked
 * line.
 */
export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const compare = useCompareList()
  const fromUrl = parseUsdots(params.get('usdot'))
  const usdots = fromUrl.length ? fromUrl : (compare?.usdots ?? [])
  const facts = useComparison(usdots)
  const reduce = useReducedMotion()
  const searchPath = useSearchPath()
  // Insurance agents compare carriers without the booking verdict (as on the carrier page).
  const { data: me } = useMe()
  const verdicts = me?.role !== 'INSURANCE_AGENT'

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

  const best = new Map(COMPARE_ROWS.map((row) => [row.key, bestOnRow(row, facts)]))
  const ranked = rankCarriers(facts)
  // One carrier isn't ranked, but still gets its verdict.
  const rankedAt = (i: number): Ranked | null =>
    ranked?.[i] ??
    (facts.length === 1 && !facts[0].profileError
      ? { vetting: vetCarrier(facts[0]), rank: null }
      : null)
  const open = MAX_COMPARE - usdots.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#101853] text-white shadow-sm">
            <Columns3 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={`${LABEL} text-accent-strong`}>
              {verdicts ? 'Booking check · ' : ''}
              {usdots.length} of {MAX_COMPARE} carriers
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
              Compare carriers
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Up to {MAX_COMPARE} carriers side by side, from the same FMCSA records as each
              profile.{verdicts && ' Each gets a booking verdict;'} The best value on each line is
              highlighted.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
          {usdots.length > 0 && <CopyLink />}
          {open > 0 && <AddCarrier onAdd={(u) => setList([...usdots, u])} existing={usdots} />}
        </div>
      </div>

      {usdots.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-surface p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: MAX_COMPARE }, (_, i) => (
              <div
                key={i}
                className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 text-xs text-slate-500"
              >
                <span className="font-label grid size-8 place-items-center rounded-full bg-amber-300 text-[11px] font-semibold text-[#060d24]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                Carrier {i + 1}
              </div>
            ))}
          </div>
          <div className="mt-5 text-center text-sm text-slate-600">
            <p className="font-medium text-slate-900">No carriers to compare yet</p>
            <p className="mt-1">
              Add a USDOT number above, or{' '}
              <Link to={searchPath} className="font-medium text-accent-strong hover:underline">
                search for carriers
              </Link>{' '}
              and press <span className="font-medium">Compare</span> on each one.
            </p>
          </div>
        </div>
      ) : (
        <>
          {verdicts && <Summary facts={facts} ranked={ranked} />}

          <div
            className={`grid gap-3 sm:grid-cols-2 ${usdots.length + Math.min(open, 1) >= 3 ? 'lg:grid-cols-3' : ''}`}
          >
            {facts.map((f, i) => (
              <motion.div
                key={f.usdot}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.07 }}
              >
                <CarrierCard
                  facts={f}
                  ranked={rankedAt(i)}
                  verdict={verdicts}
                  onRemove={() => setList(usdots.filter((u) => u !== f.usdot))}
                />
              </motion.div>
            ))}
            {open > 0 && (
              <Link
                to={searchPath}
                className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 transition-colors hover:border-slate-400 hover:bg-surface"
              >
                <Search className="size-5 text-slate-400" aria-hidden />
                <span className="font-medium text-slate-900">
                  {open} open slot{open === 1 ? '' : 's'}
                </span>
                <span className="text-xs">Search for a carrier, or add a USDOT number above</span>
              </Link>
            )}
          </div>

          <CompareTable facts={facts} best={best} />

          <p className="text-xs text-slate-500">
            The Estimated ISS is Carrier Safety Scan’s estimate of FMCSA’s Inspection Selection
            System score, not an FMCSA figure. Source: FMCSA records, refreshed on the date in the
            table. Open a carrier for the source of every value.
          </p>
        </>
      )}
      {verdicts && <HowWeDecide />}
    </div>
  )
}

function CompareTable({ facts, best }: { facts: CarrierFacts[]; best: Map<string, number[]> }) {
  const carrierPath = useCarrierPath()
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-surface shadow-sm">
      <table className="w-full min-w-[600px] table-fixed text-sm">
        <colgroup>
          <col className="w-44 sm:w-52" />
          {facts.map((f) => (
            <col key={f.usdot} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 align-bottom">
            <th
              scope="col"
              className={`${LABEL} sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-slate-500`}
            >
              Line by line
            </th>
            {facts.map((f) => (
              <th key={f.usdot} scope="col" className="px-4 py-3 text-left font-normal">
                {f.profile ? (
                  <Link
                    to={carrierPath(f.usdot)}
                    className="line-clamp-2 font-semibold text-slate-900 hover:underline"
                  >
                    {f.profile.legal_name}
                  </Link>
                ) : (
                  <span className="text-slate-500">
                    {f.profileError ? 'Not loaded' : 'Loading…'}
                  </span>
                )}
                <span className="block font-mono text-xs text-slate-500">USDOT {f.usdot}</span>
              </th>
            ))}
          </tr>
        </thead>
        {GROUPED.map(([title, rows]) => (
          <tbody key={title} className="divide-y divide-slate-100">
            <tr className="bg-[#101853]/[0.04]">
              <th
                scope="colgroup"
                colSpan={facts.length + 1}
                className={`${LABEL} px-4 pb-1.5 pt-4 text-left text-accent-strong`}
              >
                <span className="sticky left-4 inline-block">{title}</span>
              </th>
            </tr>
            {rows.map((row) => {
              const bestHere = best.get(row.key) ?? []
              return (
                <tr key={row.key} className="align-top transition-colors hover:bg-slate-50/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-normal"
                  >
                    <span className="font-medium text-slate-800">{row.label}</span>
                    {row.hint && <span className="block text-xs text-slate-500">{row.hint}</span>}
                  </th>
                  {facts.map((f, i) => {
                    const isBest = bestHere.includes(i)
                    return (
                      <td
                        key={f.usdot}
                        className={`px-4 py-3 text-slate-800 ${isBest ? 'bg-emerald-50 shadow-[inset_3px_0_0_var(--color-emerald-600)]' : ''}`}
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
              )
            })}
          </tbody>
        ))}
      </table>
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

function CarrierCard({
  facts,
  ranked,
  verdict,
  onRemove,
}: {
  facts: CarrierFacts
  ranked: Ranked | null
  /** Show the booking check (not for insurance agents) */
  verdict: boolean
  onRemove: () => void
}) {
  const carrierPath = useCarrierPath()
  const notFound = facts.profileError instanceof ApiError && facts.profileError.status === 404
  const v = ranked?.vetting
  const accent =
    !v || !verdict
      ? 'bg-slate-300'
      : v.verdict === 'ready'
        ? 'bg-emerald-600'
        : v.verdict === 'review'
          ? 'bg-amber-600'
          : 'bg-red-600'
  const address =
    facts.profile?.addresses.find((a) => a.address_type === 'PHYSICAL') ??
    facts.profile?.addresses[0]
  const place = address ? [address.city, address.state].filter(Boolean).join(', ') : ''

  return (
    <article className="relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-surface p-4 pl-5 shadow-sm">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {facts.profile ? (
            <Link
              to={carrierPath(facts.usdot)}
              className="line-clamp-2 font-semibold text-slate-900 hover:underline"
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
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="font-mono">USDOT {facts.usdot}</span>
            {place && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="size-3" aria-hidden />
                {place}
              </span>
            )}
          </span>
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
      <div className={verdict ? 'mt-3' : 'hidden'}>
        {ranked?.vetting ? (
          <VerdictCard ranked={ranked} />
        ) : (
          !facts.profileError && (
            <div className="space-y-1.5" aria-label="Loading booking check">
              <span className="block h-5 w-28 animate-pulse rounded-full bg-slate-200" />
              <span className="block h-3 w-3/4 animate-pulse rounded bg-slate-200" />
            </div>
          )
        )}
      </div>
    </article>
  )
}

/** Top of the page: a prompt, a loading note, or the verdict summary. */
function Summary({ facts, ranked }: { facts: CarrierFacts[]; ranked: Ranked[] | null }) {
  if (facts.length < 2) {
    return (
      <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600 shadow-sm">
        Add at least one more carrier to see which one to give the load to.
      </p>
    )
  }
  if (!ranked) {
    return (
      <p
        className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600 shadow-sm"
        role="status"
      >
        Loading… a carrier not yet in Carrier Safety Scan is fetched from FMCSA first, which can
        take a few seconds.
      </p>
    )
  }
  return <VerdictSummary facts={facts} ranked={ranked} />
}

/** Copies this page's address: the carriers are in it, so a colleague sees the same comparison. */
function CopyLink() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
  }
  const Icon = copied ? Check : Link2
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900"
    >
      <Icon className="size-4" aria-hidden />
      <span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span>
    </button>
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
    <form onSubmit={submit} className="flex flex-col gap-1 sm:items-end">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          placeholder="USDOT number"
          aria-label="USDOT number to add"
          className="w-36 rounded-md border border-slate-300 bg-surface px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:w-40"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-cta px-3 py-1.5 text-sm font-medium text-cta-ink hover:bg-cta-hover active:bg-cta-active"
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  )
}
