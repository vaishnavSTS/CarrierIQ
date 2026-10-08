import { useState } from 'react'

import { CHROME, INK, niceScale, ticks } from './chartTheme'
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip'
import { useElementWidth } from './useElementWidth'

export interface Column {
  key: string
  tick: string // short x-axis label
  title: string // tooltip heading
  value: number
  valueLabel: string // e.g. "inspections"
  details?: string[] // extra tooltip lines
}

const MARGIN = { top: 12, right: 8, bottom: 24, left: 40 }
const MAX_BAR = 24
const RADIUS = 4

/** Single-series columns: one hue, capped bar width, rounded data end, per-bar hover/focus. */
export function ColumnChart({
  data,
  color,
  height = 200,
  ariaLabel,
}: {
  data: Column[]
  color: string
  height?: number
  ariaLabel: string
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const scale = niceScale(Math.max(...data.map((d) => d.value), 1))
  const y = (v: number) => MARGIN.top + plotH - (v / scale.max) * plotH
  const band = plotW / Math.max(data.length, 1)
  const barW = Math.min(MAX_BAR, band * 0.7)
  const labelEvery = Math.max(1, Math.ceil(44 / band)) // keep ticks ≥44px apart
  const centre = (i: number) => MARGIN.left + band * i + band / 2

  return (
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
              {t.toLocaleString()}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const top = y(d.value)
          const h = MARGIN.top + plotH - top
          const x = centre(i) - barW / 2
          const r = Math.min(RADIUS, h, barW / 2)
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  // Rounded data end, square at the baseline.
                  d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                  fill={color}
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={centre(i)}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill={INK.muted}
                >
                  {d.tick}
                </text>
              )}
              {/* Hit target: the whole band, bigger than the bar. */}
              <rect
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.title}: ${d.value} ${d.valueLabel}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
            </g>
          )
        })}
      </svg>

      {active !== null && (
        <Tooltip x={centre(active)} y={y(data[active].value)}>
          <TooltipTitle>{data[active].title}</TooltipTitle>
          <TooltipRow value={data[active].value.toLocaleString()} label={data[active].valueLabel} />
          {data[active].details?.map((line) => (
            <div key={line} className="text-slate-500">
              {line}
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  )
}
