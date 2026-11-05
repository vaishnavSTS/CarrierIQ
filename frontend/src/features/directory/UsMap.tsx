import { geoPath } from 'd3-geo'
import type { Feature, Geometry } from 'geojson'
import { useMemo, useState, type MouseEvent } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'

import type { StateCount } from '../../api/directory'

/*
 * The US map: each state shaded by how many active interstate carriers it has, a card on hover,
 * and a click (or Enter) picks the state. Used by the portals' Carrier map page and the public
 * audience pages.
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
export const SHADES = ['#dbe7ff', '#b7cdff', '#86a8ff', '#5179f0', '#2a4fc9', '#101853']

export const number = new Intl.NumberFormat('en-US')

export function UsMap({
  counts,
  selected,
  onSelect,
}: {
  counts: StateCount[] | undefined
  selected: string | null
  onSelect: (state: string) => void
}) {
  const [hover, setHover] = useState<{ state: StateCount; x: number; y: number } | null>(null)

  const byName = useMemo(() => new Map((counts ?? []).map((s) => [s.name, s])), [counts])
  const shade = useMemo(() => {
    const sorted = [...(counts ?? [])].map((s) => s.carriers).sort((a, b) => a - b)
    return (n: number) => {
      if (!sorted.length) return '#e5e7eb'
      const rank = sorted.findIndex((v) => v >= n) / sorted.length
      return SHADES[Math.min(SHADES.length - 1, Math.floor(rank * SHADES.length))]
    }
  }, [counts])

  const move = (event: MouseEvent, state: StateCount) => {
    const box = (event.currentTarget.closest('[data-map]') as HTMLElement).getBoundingClientRect()
    setHover({ state, x: event.clientX - box.left, y: event.clientY - box.top })
  }

  return (
    <div>
      <div data-map className="relative">
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
                onClick={() => state && onSelect(state.state)}
                tabIndex={state ? 0 : -1}
                role={state ? 'button' : undefined}
                aria-label={
                  state ? `${state.name}: ${number.format(state.carriers)} carriers` : undefined
                }
                onKeyDown={(e) => {
                  if (state && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onSelect(state.state)
                  }
                }}
              />
            )
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[115%] rounded-xl bg-[#101853] px-3.5 py-2.5 text-left text-white shadow-xl"
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
    </div>
  )
}
