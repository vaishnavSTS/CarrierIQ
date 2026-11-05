import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarPlus,
  FlaskConical,
  MapPinned,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import {
  getCountyCounts,
  getPublicCountyCounts,
  getPublicStateCarriers,
  getPublicStateCounts,
  getStateCarriers,
  getStateCounts,
  type CountyCount,
  type DirectorySort,
  type PublicCarrier,
  type DirectoryStatus,
  type StateCount,
} from '../../api/directory'
import { formatDate } from '../../utils/format'
import { countiesOf, countyLabel, useCountyShapes } from '../directory/counties'
import { CarrierCardDialog } from '../directory/CarrierCardDialog'
import { CountyMap } from '../directory/CountyMap'
import { number, stateFips, UsMap } from '../directory/UsMap'
import { CountUp } from './CountUp'
import { reveal, SectionHeading } from './landingParts'

/*
 * The carrier map. Every state shaded by its active interstate carriers, or, where `allowInactive`,
 * its inactive ones; click one for its newest, largest or A–Z carriers. The map then shows that
 * state's counties: click one and the list narrows to it (a drop-down does the same on phones).
 * On the public audience pages (no login) a state shows its first 10 carriers, each opening the
 * free search. In the broker portal (brokers and insurance agents, `portal`) it lists every carrier, 25 a
 * page, each opening its page in the portal (`carrierLink`). No wording here about where the data
 * comes from (the public pages' rule).
 */

const SORTS: {
  key: DirectorySort
  label: string
  icon: LucideIcon
  note: string
  /** Only in the portals, and only for active carriers */
  portalOnly?: boolean
  /** A portal tab that also lists inactive carriers */
  withInactive?: boolean
}[] = [
  { key: 'newest', label: 'Newest', icon: CalendarPlus, note: 'Newest USDOT registrations first.' },
  {
    key: 'largest',
    label: 'Largest',
    icon: Truck,
    note: 'By the fleet each carrier reported. A new USDOT reporting a very large fleet is marked: check it before relying on the number.',
  },
  { key: 'az', label: 'A–Z', icon: Building2, note: 'By company name.' },
  {
    key: 'rated',
    label: 'Satisfactory rating',
    icon: BadgeCheck,
    note: 'Carriers with a Satisfactory safety rating from an FMCSA audit, most recent first. A rating can be many years old: check its date.',
    portalOnly: true,
  },
  {
    key: 'hazmat',
    label: 'Hazmat',
    icon: FlaskConical,
    note: 'Carriers FMCSA’s registration records list as hauling hazardous materials, newest first. It is what the carrier registered, not a hazmat safety permit: check the permit before booking a placarded load.',
    portalOnly: true,
    withInactive: true,
  },
]
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** A county as the list and its drop-down show it */
type CountyOption = CountyCount & { label: string }

export function MapSection({
  number: sectionNumber,
  title,
  aside,
  signUp,
  allowInactive = false,
  portal = false,
  carrierLink,
  contactCards = false,
}: {
  number?: string
  title: ReactNode
  aside: string
  /** Show the Active / Inactive switch */
  allowInactive?: boolean
  /** Shown to visitors who aren't logged in */
  signUp?: { to: string; label: string }
  /** In a portal: every carrier, from the logged-in API */
  portal?: boolean
  /** In a portal: where a carrier opens, or null when it can't be opened there */
  carrierLink?: (usdot: number) => string | null
  /** The broker portal: a clicked carrier opens a card with its phone, email and address */
  contactCards?: boolean
}) {
  const [status, setStatus] = useState<DirectoryStatus>('active')
  const inactive = status === 'inactive'
  const counts = useQuery({
    queryKey: [portal ? 'directory' : 'public-directory', 'states', status],
    queryFn: () => (portal ? getStateCounts(status) : getPublicStateCounts(status)),
  })
  const [selected, setSelectedState] = useState<string | null>(null)
  const [county, setCounty] = useState<string | null>(null)
  const setSelected = (state: string | null) => {
    setSelectedState(state)
    setCounty(null)
  }
  const total = (counts.data ?? []).reduce((sum, s) => sum + s.carriers, 0)
  const recent = (counts.data ?? []).reduce((sum, s) => sum + s.new_last_30_days, 0)
  const current = (counts.data ?? []).find((s) => s.state === selected) ?? null
  const fips = current ? stateFips(current.name) : null

  // The picked state's counties: their totals, and their names from the county shapes.
  const countyCounts = useQuery({
    queryKey: [portal ? 'directory' : 'public-directory', 'counties', selected, status],
    queryFn: () =>
      portal ? getCountyCounts(selected!, status) : getPublicCountyCounts(selected!, status),
    enabled: Boolean(selected),
  })
  const shapes = useCountyShapes()
  const countyOptions = useMemo(() => {
    if (!current || !fips) return []
    const names = new Map(
      countiesOf(shapes.data, fips).map((c) => [c.id.slice(2), c.properties.name]),
    )
    return (countyCounts.data ?? [])
      .filter((c) => names.has(c.county))
      .map((c) => ({ ...c, label: countyLabel(current.state, c.county, names.get(c.county)) }))
  }, [current, fips, shapes.data, countyCounts.data])
  const currentCounty = countyOptions.find((c) => c.county === county) ?? null

  return (
    <div>
      <SectionHeading number={sectionNumber} eyebrow="Carrier map" title={title} aside={aside} />

      {/* The map alone, centred, until a state is picked; then the state's list slides in. */}
      <motion.div
        {...reveal()}
        className={`mt-10 grid items-start gap-6 ${current ? 'lg:grid-cols-[1.45fr_1fr]' : ''}`}
      >
        <motion.div
          layout
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full rounded-3xl border border-slate-200 bg-surface p-4 shadow-xl shadow-brand-glow/10 md:p-6 ${current ? '' : 'mx-auto max-w-4xl'}`}
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Pill
              label={inactive ? 'Inactive interstate carriers' : 'Active interstate carriers'}
              value={<CountUp value={counts.data ? total : null} />}
            />
            {!inactive && (
              <Pill
                label="Registered in the last 30 days"
                value={<CountUp value={counts.data ? recent : null} prefix="+" />}
              />
            )}
            {allowInactive && (
              <div
                role="radiogroup"
                aria-label="Which carriers"
                className="ml-auto inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200"
              >
                {(['active', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={status === s}
                    onClick={() => {
                      setStatus(s)
                      setCounty(null)
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      status === s
                        ? s === 'inactive'
                          ? 'bg-red-600 text-white shadow'
                          : 'bg-[#101853] text-white shadow'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s === 'active' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {inactive && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-100">
              An inactive USDOT number can’t be used to haul interstate. Check a carrier before you
              book or quote it.
            </p>
          )}
          {current && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-accent-strong hover:bg-accent-soft"
              >
                <ArrowLeft className="size-4" aria-hidden />
                All states
              </button>
              <span className="text-sm font-semibold text-slate-900">
                {current.name}, by county
              </span>
            </div>
          )}
          {counts.isError ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The map couldn’t load just now. Try again in a moment.
            </p>
          ) : current && fips ? (
            countyCounts.isError ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                The county map couldn’t load just now. Try again in a moment.
              </p>
            ) : (
              <CountyMap
                key={`${current.state}-${status}`}
                state={current.state}
                stateFips={fips}
                counts={countyCounts.data}
                selected={county}
                onSelect={setCounty}
                inactive={inactive}
              />
            )
          ) : (
            <UsMap
              counts={counts.data}
              selected={selected}
              onSelect={setSelected}
              inactive={inactive}
            />
          )}
          {counts.data && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong">
              <MapPinned className="size-4" aria-hidden />
              {current ? 'Click a county to see its carriers' : 'Click a state to see its carriers'}
            </p>
          )}
        </motion.div>

        <AnimatePresence>
          {current && (
            <motion.div
              key={`${current.state}-${status}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <StateList
                state={current}
                status={status}
                signUp={signUp}
                portal={portal}
                carrierLink={carrierLink}
                contactCards={contactCards}
                county={currentCounty}
                counties={countyOptions}
                onCounty={setCounty}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2 ring-1 ring-slate-200">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  )
}

function StateList({
  state,
  status,
  signUp,
  portal,
  carrierLink,
  contactCards,
  county,
  counties,
  onCounty,
}: {
  state: StateCount
  status: DirectoryStatus
  signUp?: { to: string; label: string }
  portal: boolean
  carrierLink?: (usdot: number) => string | null
  contactCards: boolean
  /** The county the list is narrowed to, or null for the whole state */
  county: CountyOption | null
  /** The state's counties, most carriers first (the drop-down) */
  counties: CountyOption[]
  onCounty: (county: string | null) => void
}) {
  const inactive = status === 'inactive'
  const [sort, setSort] = useState<DirectorySort>('newest')
  const [letter, setLetter] = useState<string | null>(null)
  // The page goes back to the first whenever the county changes.
  const [paging, setPaging] = useState<{ county: string | null; page: number }>({
    county: null,
    page: 0,
  })
  const page = paging.county === (county?.county ?? null) ? paging.page : 0
  const setPage = (next: number | ((p: number) => number)) =>
    setPaging({
      county: county?.county ?? null,
      page: typeof next === 'function' ? next(page) : next,
    })
  const list = useQuery({
    queryKey: [
      portal ? 'directory' : 'public-directory',
      state.state,
      county?.county ?? null,
      status,
      sort,
      letter,
      page,
    ],
    queryFn: () =>
      portal
        ? getStateCarriers(state.state, sort, letter, page, status, county?.county ?? null)
        : getPublicStateCarriers(state.state, sort, letter, status, county?.county ?? null),
  })
  const [open, setOpen] = useState<PublicCarrier | null>(null)
  const linkFor = (usdot: number) => (portal ? (carrierLink?.(usdot) ?? null) : `/try?q=${usdot}`)
  // The census has no date for going inactive: for inactive carriers "newest" means registered.
  const note =
    inactive && sort === 'newest'
      ? 'Most recently registered first. The date a carrier went inactive isn’t recorded.'
      : SORTS.find((s) => s.key === sort)?.note

  const tabs = SORTS.filter((s) => !s.portalOnly || (portal && (!inactive || s.withInactive)))
  const compact = tabs.length > 3

  const choose = (next: DirectorySort) => {
    setSort(next)
    setPage(0)
  }
  const pickLetter = (next: string | null) => {
    setLetter(next)
    setPage(0)
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-surface shadow-xl shadow-brand-glow/10">
      <div className={`px-5 py-4 text-white ${inactive ? 'bg-red-900' : 'bg-[#101853]'}`}>
        {county ? (
          <>
            <button
              type="button"
              onClick={() => onCounty(null)}
              className="-ml-1 mb-1 inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              All of {state.name}
            </button>
            <div className="text-xl font-semibold">
              {county.label}, {state.state}
            </div>
            <div className="mt-1 text-sm text-white/85">
              <CountUp key={county.county} value={county.carriers} />{' '}
              {inactive ? 'inactive' : 'active'} interstate carriers
              {!inactive && (
                <>
                  {' · '}
                  <span className="text-amber-300">
                    <CountUp
                      key={`n-${county.county}`}
                      value={county.new_last_30_days}
                      prefix="+"
                    />{' '}
                    in the last 30 days
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-xl font-semibold">{state.name}</div>
            <div className="mt-1 text-sm text-white/85">
              {inactive ? (
                <>
                  <CountUp key={state.state} value={state.carriers} /> inactive interstate carriers
                </>
              ) : (
                <>
                  <CountUp key={state.state} value={state.carriers} /> active interstate carriers ·{' '}
                  <span className="text-amber-300">
                    <CountUp key={state.state} value={state.new_last_30_days} prefix="+" /> in the
                    last 30 days
                  </span>
                </>
              )}
            </div>
          </>
        )}
        {counties.length > 0 && (
          <label className="mt-3 block">
            <span className="sr-only">County</span>
            <select
              value={county?.county ?? ''}
              onChange={(e) => onCounty(e.target.value || null)}
              className="w-full rounded-lg border-0 bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 [&>option]:text-slate-900"
            >
              <option value="">All of {state.name}</option>
              {counties.map((c) => (
                <option key={c.county} value={c.county}>
                  {c.label} · {number.format(c.carriers)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Five tabs in the portals: kept on one line, without icons, scrolling sideways if the
          panel is narrower still. */}
      <div
        role="tablist"
        className={`flex border-b border-slate-100 px-4 pt-3 ${compact ? 'gap-0.5 overflow-x-auto' : 'flex-wrap gap-1'}`}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sort === key}
            onClick={() => choose(key)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg py-2 font-medium ${compact ? 'px-2.5 text-[13px]' : 'px-3 text-sm'} ${
              sort === key
                ? 'bg-accent-soft text-accent-strong'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {!compact && <Icon className="size-4" aria-hidden />}
            {inactive && key === 'newest' ? 'Recently registered' : label}
          </button>
        ))}
      </div>

      {sort === 'az' && (
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => pickLetter(null)}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${letter === null ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            All
          </button>
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pickLetter(l)}
              className={`w-6 rounded py-0.5 text-xs font-semibold ${letter === l ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <p className="px-4 pt-3 text-xs text-slate-500">{note}</p>

      <ul className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
        {list.isPending &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            </li>
          ))}
        {list.isError && (
          <li className="px-4 py-6 text-sm text-amber-900">
            This list couldn’t load just now. Try again in a moment.
          </li>
        )}
        {list.data?.carriers.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-600">No carriers here.</li>
        )}
        {list.data?.carriers.map((c) => (
          <li key={c.usdot_number} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              {/* The broker portal: its card, with contact details. Elsewhere: it opens. */}
              {contactCards ? (
                <button
                  type="button"
                  onClick={() => setOpen(c)}
                  title="See its contact details"
                  className="text-left font-medium text-slate-900 hover:text-accent-strong hover:underline"
                >
                  {c.legal_name}
                </button>
              ) : linkFor(c.usdot_number) ? (
                <Link
                  to={linkFor(c.usdot_number)!}
                  title={portal ? 'Open this carrier' : 'Open it with your free search'}
                  className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                >
                  {c.legal_name}
                </Link>
              ) : (
                <span className="font-medium text-slate-900">{c.legal_name}</span>
              )}
              <div className="mt-0.5 text-xs text-slate-500">
                <span className="font-mono">USDOT {c.usdot_number}</span>
                {c.city && ` · ${c.city}`}
                {inactive && (
                  <span className="ml-2 rounded-full bg-red-50 px-1.5 py-px text-[10.5px] font-semibold uppercase text-red-700 ring-1 ring-red-200">
                    Inactive
                  </span>
                )}
              </div>
              {c.fleet_needs_check && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="size-3" aria-hidden />
                  New USDOT reporting a very large fleet
                </div>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-slate-600">
              <div className="font-semibold tabular-nums text-slate-900">
                {c.power_units != null
                  ? `${number.format(c.power_units)} ${c.power_units === 1 ? 'truck' : 'trucks'}`
                  : '—'}
              </div>
              {sort === 'rated' && c.rated_on ? (
                <div className="font-medium text-emerald-700">Rated {formatDate(c.rated_on)}</div>
              ) : (
                <div>Since {formatDate(c.registered_on)}</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Public: the first 10 only, the rest after logging in. */}
      {!portal && list.data?.has_more && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
          Showing the first 10. Every carrier is on the map in the broker and insurance agent
          portals.
        </p>
      )}

      {portal && list.data && (page > 0 || list.data.has_more) && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-slate-500">Page {page + 1}</span>
          <button
            type="button"
            disabled={!list.data.has_more}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {signUp && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-600">
            Click a carrier to open it with your free search.
          </span>
          <Link
            to={signUp.to}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#101853] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1e3a8a]"
          >
            {signUp.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
      {contactCards && open && (
        <CarrierCardDialog
          carrier={open}
          openTo={linkFor(open.usdot_number)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
