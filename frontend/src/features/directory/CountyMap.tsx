import { geoPath } from 'd3-geo'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'

import type { CountyCount } from '../../api/directory'
import { countiesOf, countyLabel, useCountyShapes } from './counties'
import { number, SHADES } from './UsMap'

/*
 * One state's counties, shaded by how many carriers each has (by rank, like the state map), with a
 * gold dot where carriers registered in the last 30 days. Hover for the county's numbers; click
 * (or Enter) picks it and the list narrows to it; clicking it again goes back to the whole state.
 * Drawn in the state map's own frame (Albers USA), framed to the state.
 */

const path = geoPath() // already projected

export function CountyMap({
  state,
  stateFips,
  counts,
  selected,
  onSelect,
  inactive = false,
}: {
  /** The state's two letters (TX) */
  state: string
  /** The state's two-digit FIPS code (48) */
  stateFips: string
  counts: CountyCount[] | undefined
  /** A county's three-digit code, or null for the whole state */
  selected: string | null
  onSelect: (county: string | null) => void
  inactive?: boolean
}) {
  const shapes = useCountyShapes()
  const reduceMotion = useReducedMotion()
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null)

  const counties = useMemo(() => countiesOf(shapes.data, stateFips), [shapes.data, stateFips])
  const byCode = useMemo(() => new Map((counts ?? []).map((c) => [c.county, c])), [counts])
  const shade = useMemo(() => {
    const sorted = (counts ?? []).map((c) => c.carriers).sort((a, b) => a - b)
    return (n: number) => {
      if (!sorted.length || n === 0) return '#e5e7eb'
      const rank = sorted.findIndex((v) => v >= n) / sorted.length
      return SHADES[Math.min(SHADES.length - 1, Math.floor(rank * SHADES.length))]
    }
  }, [counts])

  // Framed to the state, with a little room around it.
  const frame = useMemo(() => {
    if (!counties.length) return null
    const boxes = counties.map((c) => path.bounds(c))
    const x0 = Math.min(...boxes.map((b) => b[0][0]))
    const y0 = Math.min(...boxes.map((b) => b[0][1]))
    const x1 = Math.max(...boxes.map((b) => b[1][0]))
    const y1 = Math.max(...boxes.map((b) => b[1][1]))
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
  }, [counties])

  // New registrations: a dot at each county's centre, its area growing with the count.
  const dots = useMemo(() => {
    if (inactive || !frame) return []
    const most = Math.max(1, ...(counts ?? []).map((c) => c.new_last_30_days))
    const unit = frame.w / 230 // dot sizes follow the state's size on screen
    return counties.flatMap((shape, i) => {
      const count = byCode.get(shape.id.slice(2))
      if (!count || count.new_last_30_days <= 0) return []
      const [x, y] = path.centroid(shape)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      const r = unit * (0.7 + 1.9 * Math.sqrt(count.new_last_30_days / most))
      return [{ id: shape.id, x, y, r, delay: (i * 0.37) % 2.4 }]
    })
  }, [counties, byCode, counts, frame, inactive])

  if (shapes.isError) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        The county map couldn’t load just now. Try again in a moment.
      </p>
    )
  }
  if (!frame || !counts) {
    return (
      <div
        aria-busy
        className="grid aspect-[975/610] w-full animate-pulse place-items-center rounded-xl bg-slate-100 text-sm text-slate-500"
      >
        Loading the counties…
      </div>
    )
  }

  const move = (event: MouseEvent, code: string) => {
    const box = (event.currentTarget.closest('[data-map]') as HTMLElement).getBoundingClientRect()
    setHover({ code, x: event.clientX - box.left, y: event.clientY - box.top })
  }
  const pick = (code: string) => onSelect(code === selected ? null : code)
  const hovered = hover ? counties.find((c) => c.id.slice(2) === hover.code) : null
  const hoveredCount = hover ? byCode.get(hover.code) : null
  const selectedShape = selected ? counties.find((c) => c.id.slice(2) === selected) : null

  return (
    <div data-map className="relative">
      <svg
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        className="h-auto max-h-[34rem] w-full"
        role="img"
        aria-label="County map"
      >
        {counties.map((shape) => {
          const code = shape.id.slice(2)
          const count = byCode.get(code)
          const name = countyLabel(state, code, shape.properties.name)
          return (
            <path
              key={shape.id}
              d={path(shape) ?? undefined}
              fill={shade(count?.carriers ?? 0)}
              stroke="#ffffff"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              opacity={selected && code !== selected ? 0.45 : 1}
              tabIndex={0}
              role="button"
              aria-label={`${name}: ${number.format(count?.carriers ?? 0)} carriers`}
              aria-pressed={code === selected}
              onMouseMove={(e) => move(e, code)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pick(code)}
              onKeyDown={(e: KeyboardEvent<SVGPathElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  pick(code)
                }
              }}
              className="cursor-pointer outline-none transition-opacity duration-300 hover:opacity-80 focus-visible:opacity-70"
            />
          )
        })}
        {/* The picked county again, on top, with a gold outline. */}
        {selectedShape && (
          <path
            d={path(selectedShape) ?? undefined}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {!selected && (
          <g aria-hidden className="pointer-events-none">
            {dots.map(({ id, x, y, r, delay }) => (
              <g key={id}>
                {!reduceMotion && (
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: 3, opacity: 0 }}
                    transition={{ duration: 2.4, delay, repeat: Infinity, ease: 'easeOut' }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill="#fbbf24"
                  stroke="#ffffff"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </g>
        )}
      </svg>

      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[115%] rounded-xl bg-[#101853] px-3.5 py-2.5 text-left text-white shadow-xl"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="text-sm font-semibold">
            {countyLabel(state, hover.code, hovered.properties.name)}
          </div>
          <div className="mt-1 text-xs text-white/85">
            {number.format(hoveredCount?.carriers ?? 0)} {inactive ? 'inactive' : 'active'}{' '}
            interstate carriers
          </div>
          {!inactive && (
            <div className="text-xs text-amber-300">
              +{number.format(hoveredCount?.new_last_30_days ?? 0)} in the last 30 days
            </div>
          )}
        </div>
      )}
    </div>
  )
}
