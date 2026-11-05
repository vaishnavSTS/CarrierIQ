import { geoPath } from 'd3-geo'
import type { Feature, Geometry } from 'geojson'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'

import type { StateCount } from '../../api/directory'

/*
 * The US map: each state shaded by how many active interstate carriers it has, a card on hover,
 * and a click (or Enter) picks the state: it pops out, bigger and above the rest with a shadow and
 * a gold outline, and the others fade back; clicking it again puts it back. No focus box on click.
 * Used by the public audience pages (features/landing/MapSection.tsx).
 */

type StateProps = { name: string }
const topology = usAtlas as unknown as Topology<{ states: GeometryCollection<StateProps> }>
const STATE_SHAPES = (
  feature(topology, topology.objects.states) as unknown as {
    features: Feature<Geometry, StateProps>[]
  }
).features
const path = geoPath() // the shapes are already projected (Albers USA, 975 × 610)
const WIDTH = 975
const HEIGHT = 610
const POP_SIZE = 150
const POP_MIN = 1.35
const POP_MAX = 4

/** Darker blue for more carriers: six shades, split by rank so every shade is used. */
export const SHADES = ['#dbe7ff', '#b7cdff', '#86a8ff', '#5179f0', '#2a4fc9', '#101853']

export const number = new Intl.NumberFormat('en-US')

export function UsMap({
  counts,
  selected,
  onSelect,
  inactive = false,
}: {
  counts: StateCount[] | undefined
  /** The counts are of inactive carriers (the hover card says so, without "new") */
  inactive?: boolean
  selected: string | null
  /** A state's code, or null to go back to the whole US */
  onSelect: (state: string | null) => void
}) {
  const [hover, setHover] = useState<{ state: StateCount; x: number; y: number } | null>(null)
  const reduceMotion = useReducedMotion()

  const byName = useMemo(() => new Map((counts ?? []).map((s) => [s.name, s])), [counts])
  const shade = useMemo(() => {
    const sorted = [...(counts ?? [])].map((s) => s.carriers).sort((a, b) => a - b)
    return (n: number) => {
      if (!sorted.length) return '#e5e7eb'
      const rank = sorted.findIndex((v) => v >= n) / sorted.length
      return SHADES[Math.min(SHADES.length - 1, Math.floor(rank * SHADES.length))]
    }
  }, [counts])

  // One dot per state with new registrations, at the state's centre; the area grows with the
  // count. Delays are spread so the pulses ripple across the map rather than beat together.
  const newDots = useMemo(() => {
    const most = Math.max(1, ...(counts ?? []).map((s) => s.new_last_30_days))
    return STATE_SHAPES.flatMap((shape, i) => {
      const state = byName.get(shape.properties.name)
      if (!state || state.new_last_30_days <= 0) return []
      const [x, y] = path.centroid(shape)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      const r = 2.5 + 5.5 * Math.sqrt(state.new_last_30_days / most)
      return [{ name: shape.properties.name, x, y, r, delay: (i * 0.37) % 2.4 }]
    })
  }, [counts, byName])

  const move = (event: MouseEvent, state: StateCount) => {
    const box = (event.currentTarget.closest('[data-map]') as HTMLElement).getBoundingClientRect()
    setHover({ state, x: event.clientX - box.left, y: event.clientY - box.top })
  }

  // The picked state pops out: it grows in its own place, above the rest, with a shadow. Small
  // states grow more (to about POP_SIZE across), large ones a little (POP_MIN), never past POP_MAX.
  const selectedName = (counts ?? []).find((s) => s.state === selected)?.name
  const selectedShape = STATE_SHAPES.find((s) => s.properties.name === selectedName)
  const pop = useMemo(() => {
    if (!selectedShape) return 1
    const [[x0, y0], [x1, y1]] = path.bounds(selectedShape)
    return Math.min(POP_MAX, Math.max(POP_MIN, POP_SIZE / Math.max(x1 - x0, y1 - y0)))
  }, [selectedShape])

  const shapeProps = (shape: (typeof STATE_SHAPES)[number]) => {
    const state = byName.get(shape.properties.name)
    return {
      d: path(shape) ?? undefined,
      fill: state ? shade(state.carriers) : '#e5e7eb',
      onMouseMove: state ? (e: MouseEvent) => move(e, state) : undefined,
      onMouseLeave: () => setHover(null),
      onClick: () => state && onSelect(state.state === selected ? null : state.state),
      tabIndex: state ? 0 : -1,
      role: state ? 'button' : undefined,
      'aria-label': state ? `${state.name}: ${number.format(state.carriers)} carriers` : undefined,
      'aria-pressed': state ? state.state === selected : undefined,
      onKeyDown: (e: KeyboardEvent<SVGPathElement>) => {
        if (state && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect(state.state === selected ? null : state.state)
        }
      },
    }
  }

  return (
    <div>
      <div data-map className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label="US map"
        >
          {STATE_SHAPES.map((shape) => {
            const state = byName.get(shape.properties.name)
            const isSelected = shape.properties.name === selectedName
            return (
              <path
                key={shape.properties.name}
                {...shapeProps(shape)}
                stroke="#ffffff"
                strokeWidth={0.8}
                opacity={selectedName && !isSelected ? 0.5 : 1}
                className={`outline-none transition-opacity duration-300 focus-visible:opacity-70 ${state ? 'cursor-pointer hover:opacity-80' : ''}`}
              />
            )
          })}
          {/* New registrations: a gold dot in each state with carriers new in the last 30 days,
              sized by how many, with a ring that pulses outward (still, for reduced motion). */}
          {!inactive && !selectedName && (
            <g aria-hidden className="pointer-events-none">
              {newDots.map(({ name, x, y, r, delay }) => (
                <g key={name}>
                  {!reduceMotion && (
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ scale: 3, opacity: 0 }}
                      transition={{ duration: 2.4, delay, repeat: Infinity, ease: 'easeOut' }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                  )}
                  <circle cx={x} cy={y} r={r} fill="#fbbf24" stroke="#ffffff" strokeWidth={1} />
                </g>
              ))}
            </g>
          )}
          {/* The picked state again, on top, popped out. */}
          {selectedShape && (
            <motion.path
              key={selectedName}
              {...shapeProps(selectedShape)}
              stroke="#fbbf24"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              initial={reduceMotion ? false : { scale: 1 }}
              animate={{ scale: pop }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                filter: 'drop-shadow(0 10px 14px rgb(6 13 36 / 0.45))',
              }}
              className="cursor-pointer outline-none"
            />
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[115%] rounded-xl bg-[#101853] px-3.5 py-2.5 text-left text-white shadow-xl"
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="text-sm font-semibold">{hover.state.name}</div>
            <div className="mt-1 text-xs text-white/85">
              {number.format(hover.state.carriers)} {inactive ? 'inactive' : 'active'} interstate
              carriers
            </div>
            {!inactive && (
              <div className="text-xs text-amber-300">
                +{number.format(hover.state.new_last_30_days)} in the last 30 days
              </div>
            )}
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
        {!inactive && (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-400 ring-1 ring-white" />
            New in the last 30 days
          </span>
        )}
        <span className="ml-auto text-slate-500">Shaded by each state’s rank</span>
      </div>
    </div>
  )
}
