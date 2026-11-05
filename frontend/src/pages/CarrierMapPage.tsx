import { useQuery } from '@tanstack/react-query'
import { geoPath } from 'd3-geo'
import type { Feature, Geometry } from 'geojson'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarPlus,
  MapPinned,
  Truck,
} from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'

import {
  getStateCarriers,
  getStateCounts,
  type DirectorySort,
  type StateCount,
} from '../api/directory'
import { useCarrierPath, usePortalMode } from '../hooks/usePortalMode'
import { formatDate } from '../utils/format'
import { saferUrl } from '../utils/sources'

/*
 * The carrier map: active interstate carriers in each state, from FMCSA's Company Census File
 * (data.transportation.gov), shaded by how many there are. Hover a state for its totals; click it
 * for its carriers: newest registrations, largest reported fleets, or A–Z.
 */

type StateProps = { name: string }
const topology = usAtlas as unknown as Topology<{ states: GeometryCollection<StateProps> }>
const STATE_SHAPES = (
  feature(topology, topology.objects.states) as unknown as {
    features: Feature<Geometry, StateProps>[]
  }
).features
const path = geoPath() // the shapes are already projected (Albers USA, 975 × 610)

/** Darker blue for more carriers: six shades, split by rank so every shade is used. */
const SHADES = ['#dbe7ff', '#b7cdff', '#86a8ff', '#5179f0', '#2a4fc9', '#101853']

const SORTS: { key: DirectorySort; label: string; icon: typeof Truck }[] = [
  { key: 'newest', label: 'Newest', icon: CalendarPlus },
  { key: 'largest', label: 'Largest', icon: Truck },
  { key: 'az', label: 'A–Z', icon: Building2 },
]
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const number = new Intl.NumberFormat('en-US')

export function CarrierMapPage() {
  const counts = useQuery({ queryKey: ['directory', 'states'], queryFn: getStateCounts })
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<{ state: StateCount; x: number; y: number } | null>(null)

  const byName = useMemo(() => new Map((counts.data ?? []).map((s) => [s.name, s])), [counts.data])
  const shade = useMemo(() => {
    const sorted = [...(counts.data ?? [])].map((s) => s.carriers).sort((a, b) => a - b)
    return (n: number) => {
      if (!sorted.length) return '#e5e7eb'
      const rank = sorted.findIndex((v) => v >= n) / sorted.length
      return SHADES[Math.min(SHADES.length - 1, Math.floor(rank * SHADES.length))]
    }
  }, [counts.data])

  const total = (counts.data ?? []).reduce((sum, s) => sum + s.carriers, 0)
  const recent = (counts.data ?? []).reduce((sum, s) => sum + s.new_last_30_days, 0)
  const current = (counts.data ?? []).find((s) => s.state === selected) ?? null

  const move = (event: MouseEvent, state: StateCount) => {
    const box = (event.currentTarget.closest('[data-map]') as HTMLElement).getBoundingClientRect()
    setHover({ state, x: event.clientX - box.left, y: event.clientY - box.top })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
            Carrier map
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Carriers by state</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Active interstate carriers in each state, from FMCSA’s Company Census File. Hover a
            state for its totals, and click it to see its carriers.
          </p>
        </div>
        <dl className="flex gap-3">
          <Stat
            label="Active interstate carriers"
            value={counts.data ? number.format(total) : '…'}
          />
          <Stat
            label="Registered in the last 30 days"
            value={counts.data ? number.format(recent) : '…'}
          />
        </dl>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm md:p-6">
          <div data-map className="relative">
            {counts.isError && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Couldn’t load the state totals from FMCSA just now. Try again in a moment.
              </p>
            )}
            <svg viewBox="0 0 975 610" className="h-auto w-full" role="img" aria-label="US map">
              {STATE_SHAPES.map((shape) => {
                const state = byName.get(shape.properties.name)
                const isSelected = state && state.state === selected
                return (
                  <path
                    key={shape.properties.name}
                    d={path(shape) ?? undefined}
                    fill={state ? shade(state.carriers) : '#e5e7eb'}
                    stroke={isSelected ? '#fbbf24' : '#ffffff'}
                    strokeWidth={isSelected ? 3 : 0.8}
                    className={`transition-[fill,opacity] duration-200 ${state ? 'cursor-pointer hover:opacity-80' : ''}`}
                    onMouseMove={state ? (e) => move(e, state) : undefined}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => state && setSelected(state.state)}
                    tabIndex={state ? 0 : -1}
                    role={state ? 'button' : undefined}
                    aria-label={
                      state ? `${state.name}: ${number.format(state.carriers)} carriers` : undefined
                    }
                    onKeyDown={(e) => {
                      if (state && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        setSelected(state.state)
                      }
                    }}
                  />
                )
              })}
            </svg>

            {hover && (
              <div
                className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[115%] rounded-xl bg-[#101853] px-3.5 py-2.5 text-white shadow-xl"
                style={{ left: hover.x, top: hover.y }}
              >
                <div className="text-sm font-semibold">{hover.state.name}</div>
                <div className="mt-1 text-xs text-white/85">
                  {number.format(hover.state.carriers)} active interstate carriers
                </div>
                <div className="text-xs text-amber-300">
                  +{number.format(hover.state.new_last_30_days)} in the last 30 days
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>Fewer</span>
            <span className="flex overflow-hidden rounded-full">
              {SHADES.map((c) => (
                <span key={c} className="h-2.5 w-8" style={{ background: c }} />
              ))}
            </span>
            <span>More carriers</span>
            <span className="ml-auto text-slate-500">Shaded by each state’s rank</span>
          </div>
        </section>

        {current ? (
          <StatePanel state={current} />
        ) : (
          <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-surface/70 p-8 text-center">
            <div>
              <MapPinned className="mx-auto size-9 text-accent-strong" aria-hidden />
              <p className="mt-3 font-semibold text-slate-900">Pick a state</p>
              <p className="mt-1 text-sm text-slate-600">
                Click any state on the map to see its newest, largest and A–Z carriers.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-4 py-2.5 shadow-sm">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-slate-950">{value}</dd>
    </div>
  )
}

function StatePanel({ state }: { state: StateCount }) {
  const [sort, setSort] = useState<DirectorySort>('newest')
  const [letter, setLetter] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const mode = usePortalMode()
  const carrierPath = useCarrierPath()

  const list = useQuery({
    queryKey: ['directory', state.state, sort, letter, page],
    queryFn: () => getStateCarriers(state.state, sort, sort === 'az' ? letter : null, page),
  })

  const pick = (next: DirectorySort) => {
    setSort(next)
    setPage(0)
  }

  return (
    <section
      key={state.state}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm"
    >
      <div className="bg-[#101853] px-5 py-4 text-white">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">{state.name}</h2>
          <span className="font-mono text-xs text-white/70">{state.state}</span>
        </div>
        <p className="mt-1 text-sm text-white/85">
          {number.format(state.carriers)} active interstate carriers ·{' '}
          <span className="text-amber-300">
            +{number.format(state.new_last_30_days)} in the last 30 days
          </span>
        </p>
      </div>

      <div className="border-b border-slate-100 px-4 pt-3">
        <div role="tablist" className="flex gap-1">
          {SORTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={sort === key}
              onClick={() => pick(key)}
              className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${
                sort === key
                  ? 'bg-accent-soft text-accent-strong'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {sort === 'az' && (
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setLetter(null)
              setPage(0)
            }}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${letter === null ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            All
          </button>
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLetter(l)
                setPage(0)
              }}
              className={`w-6 rounded py-0.5 text-xs font-semibold ${letter === l ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <p className="px-4 pt-3 text-xs text-slate-500">
        {sort === 'newest' && 'Newest USDOT registrations first.'}
        {sort === 'largest' &&
          'By power units the carrier reported on its MCS-150. A new USDOT reporting a very large fleet is marked: check it before relying on the number.'}
        {sort === 'az' && 'By legal name.'}
      </p>

      <ul className="divide-y divide-slate-100">
        {list.isPending &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            </li>
          ))}
        {list.isError && (
          <li className="px-4 py-6 text-sm text-amber-900">
            Couldn’t load this list from FMCSA just now. Try again in a moment.
          </li>
        )}
        {list.data?.carriers.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-600">No carriers here.</li>
        )}
        {list.data?.carriers.map((c) => {
          const name = c.dba_name ? `${c.legal_name} (DBA ${c.dba_name})` : c.legal_name
          return (
            <li key={c.usdot_number} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                {mode === 'client' ? (
                  <a
                    href={saferUrl(c.usdot_number)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-slate-900 hover:text-accent-strong hover:underline"
                  >
                    {name}
                    <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <Link
                    to={carrierPath(c.usdot_number)}
                    className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
                  >
                    {name}
                  </Link>
                )}
                <div className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono">USDOT {c.usdot_number}</span>
                  {c.city && ` · ${c.city}`}
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
                <div>Since {formatDate(c.registered_on)}</div>
              </div>
            </li>
          )
        })}
      </ul>

      {list.data && (page > 0 || list.data.has_more) && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
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
    </section>
  )
}
