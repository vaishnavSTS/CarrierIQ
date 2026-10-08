import { useState, type KeyboardEvent, type PointerEvent } from 'react'

import { CHROME, INK, niceScale, ticks } from './chartTheme'
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip'
import { useElementWidth } from './useElementWidth'

export interface LineSeries {
  name: string
  color: string
  values: (number | null)[] // null: no data at that x (drawn as a gap, never as 0)
}

export interface LinePoint {
  tick: string
  title: string
  details?: string[]
}

const MARGIN = { top: 12, right: 112, bottom: 24, left: 44 }

/** Multi-series line on one y-axis, with a legend, end labels, and a snapping crosshair. */
export function LineChart({
  points,
  series,
  format,
  height = 220,
  ariaLabel,
  detachFrom,
}: {
  points: LinePoint[]
  series: LineSeries[]
  format: (value: number) => string
  height?: number
  ariaLabel: string
  /** Points from this index on are drawn as dots, not joined to the line (e.g. a period still
   * in progress, whose partial value would otherwise read as part of the trend). */
  detachFrom?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const scale = niceScale(Math.max(...all, 0.0001))
  const step = points.length > 1 ? plotW / (points.length - 1) : 0
  const x = (i: number) => MARGIN.left + (points.length > 1 ? step * i : plotW / 2)
  const y = (v: number) => MARGIN.top + plotH - (v / scale.max) * plotH
  const labelEvery = Math.max(1, Math.ceil(44 / Math.max(step, 1)))

  // End labels sit at each series' last value; if two would overlap, the legend carries them.
  const ends = series.map((s) => {
    const last = s.values.reduce<number | null>((found, v, i) => (v === null ? found : i), null)
    return last === null ? null : { index: last, value: s.values[last] as number }
  })
  const endYs = ends.map((e) => (e ? y(e.value) : null)).filter((v): v is number => v !== null)
  const endLabelsFit = endYs.every((a, i) =>
    endYs.every((b, j) => i === j || Math.abs(a - b) >= 14),
  )

  function moveTo(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - box.left
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(offset / Math.max(step, 1)))))
  }

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + delta)))
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>

      <div ref={ref} className="relative">
        <svg width={width} height={height} role="group" aria-label={ariaLabel}>
          {ticks(scale.max, scale.step).map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? CHROME.baseline : CHROME.grid}
              />
              <text
                x={MARGIN.left - 6}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={INK.muted}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {format(t)}
              </text>
            </g>
          ))}

          {points.map(
            (p, i) =>
              i % labelEvery === 0 && (
                <text
                  key={p.title}
                  x={x(i)}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill={INK.muted}
                >
                  {p.tick}
                </text>
              ),
          )}

          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotH}
              stroke={CHROME.baseline}
            />
          )}

          {series.map((s, si) => (
            <g key={s.name}>
              <path
                d={linePath(s.values, x, y, detachFrom)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map((v, i) => {
                const joined = (j: number) =>
                  (s.values[j] ?? null) !== null &&
                  (detachFrom === undefined || i < detachFrom === j < detachFrom)
                const isolated = v !== null && !joined(i - 1) && !joined(i + 1)
                const isEnd = ends[si]?.index === i
                const isActive = active === i
                if (v === null || !(isolated || isEnd || isActive)) return null
                return (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={4}
                    fill={s.color}
                    stroke={CHROME.surface}
                    strokeWidth={2}
                  />
                )
              })}
              {endLabelsFit && ends[si] && (
                <text
                  x={x(ends[si].index) + 8}
                  y={y(ends[si].value)}
                  dy="0.32em"
                  fontSize={11}
                  fill={INK.secondary}
                >
                  {s.name} {format(ends[si].value)}
                </text>
              )}
            </g>
          ))}

          <rect
            x={MARGIN.left - step / 2}
            y={MARGIN.top}
            width={plotW + step}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${ariaLabel}. Use left and right arrow keys to read each point.`}
            onPointerMove={moveTo}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((i) => i ?? points.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
            className="outline-none"
          />
        </svg>

        {active !== null && (
          <Tooltip x={x(active)} y={MARGIN.top + 8}>
            <TooltipTitle>{points[active].title}</TooltipTitle>
            {series.map((s) => (
              <TooltipRow
                key={s.name}
                color={s.color}
                value={s.values[active] === null ? 'n/a' : format(s.values[active] as number)}
                label={s.name}
              />
            ))}
            {points[active].details?.map((line) => (
              <div key={line} className="mt-1 text-slate-500">
                {line}
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** SVG path through the values, broken wherever a value is missing; nothing from
 * `detachFrom` on is joined. */
function linePath(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
  detachFrom?: number,
): string {
  let d = ''
  let drawing = false
  values.forEach((v, i) => {
    if (v === null || (detachFrom !== undefined && i >= detachFrom)) {
      drawing = false
      return
    }
    d += `${drawing ? 'L' : 'M'}${x(i)},${y(v)} `
    drawing = true
  })
  return d.trim()
}
