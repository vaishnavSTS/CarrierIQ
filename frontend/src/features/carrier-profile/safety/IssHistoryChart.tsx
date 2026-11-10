import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { CHROME, INK, SERIES } from '../../../components/charts/chartTheme'
import { Tooltip, TooltipRow, TooltipTitle } from '../../../components/charts/Tooltip'
import { useElementWidth } from '../../../components/charts/useElementWidth'
import type { EstimatedIss } from '../../../types/carrierSafety'
import { formatDateTime, formatMonth } from '../../../utils/format'
import { ISS_BAND } from './issBand'
import type { IssPoint } from './issPoints'
import { smoothPath, type Xy } from './smoothPath'

const MARGIN = { top: 34, right: 96, bottom: 26, left: 34 }
const HEIGHT = 230
const LINE = SERIES.blue

type Band = NonNullable<EstimatedIss['band']>

/** FMCSA's bands as tinted stripes behind the line, named in the right margin. */
const BANDS: { band: Band; from: number; to: number; fill: string }[] = [
  { band: 'PASS', from: 0, to: 50, fill: 'fill-emerald-500' },
  { band: 'OPTIONAL', from: 50, to: 75, fill: 'fill-amber-500' },
  { band: 'INSPECT', from: 75, to: 100, fill: 'fill-red-500' },
]

const DOT: Record<Band, string> = {
  PASS: 'fill-emerald-600',
  OPTIONAL: 'fill-amber-500',
  INSPECT: 'fill-red-600',
}

const RING: Record<Band, string> = {
  PASS: 'stroke-emerald-600',
  OPTIONAL: 'stroke-amber-500',
  INSPECT: 'stroke-red-600',
}

/** Short date for the axis: "Nov 10" */
function day(at: string): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Every saved Estimated ISS, oldest first, on a fixed 0–100 scale over FMCSA's bands. */
export function IssHistoryChart({ points }: { points: IssPoint[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const id = useId().replace(/:/g, '')

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const inset = points.length > 1 ? 10 : 0 // keep the end markers off the plot's edges
  const step = points.length > 1 ? (plotW - inset * 2) / (points.length - 1) : 0
  const x = (i: number) => MARGIN.left + (points.length > 1 ? inset + step * i : plotW / 2)
  const y = (v: number) => MARGIN.top + plotH - (v / 100) * plotH
  const base = y(0)
  const labelEvery = Math.max(1, Math.ceil(64 / Math.max(step, 1)))
  const markerR = points.length > 60 ? 2.5 : points.length > 25 ? 3.5 : 4.5

  // Runs of points with a score; a check without one breaks the line.
  const runs: { i: number; p: Xy }[][] = []
  points.forEach((m, i) => {
    if (m.value === null) {
      runs.push([])
      return
    }
    if (runs.length === 0) runs.push([])
    runs[runs.length - 1].push({ i, p: { x: x(i), y: y(m.value) } })
  })
  const lines = runs.filter((r) => r.length > 0)

  const lastIndex = points.length - 1 - [...points].reverse().findIndex((p) => p.value !== null)
  const last = lastIndex < points.length ? points[lastIndex] : null

  function moveTo(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - box.left - inset
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(offset / Math.max(step, 1)))))
  }

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + delta)))
    }
  }

  const shown = active === null ? null : points[active]
  const label = `Estimated ISS, ${points.length} saved ${points.length === 1 ? 'check' : 'checks'} from ${day(
    points[0].at,
  )} to ${day(points[points.length - 1].at)}`

  // The latest score, labelled on the chart; below the point when it sits near the top.
  const callout =
    last && last.value !== null && last.band
      ? (() => {
          const text = `${last.value} · ${ISS_BAND[last.band].status}`
          const w = text.length * 6.6 + 22
          const cx = x(lastIndex)
          const cy = y(last.value)
          const left = Math.min(Math.max(cx - w / 2, MARGIN.left), MARGIN.left + plotW - w)
          const top = cy - 34 < 2 ? cy + 12 : cy - 34
          return { text, w, left, top, band: last.band }
        })()
      : null

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={width} height={HEIGHT} role="group" aria-label={label}>
        <defs>
          <linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity={0.32} />
            <stop offset="100%" stopColor={LINE} stopOpacity={0} />
          </linearGradient>
          <clipPath id={`plot-${id}`}>
            <rect x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} rx={10} />
          </clipPath>
        </defs>

        <g clipPath={`url(#plot-${id})`}>
          {BANDS.map((b) => (
            <rect
              key={b.band}
              x={MARGIN.left}
              y={y(b.to)}
              width={plotW}
              height={y(b.from) - y(b.to)}
              className={`${b.fill} ${last?.band === b.band ? 'opacity-[0.16]' : 'opacity-[0.07]'}`}
            />
          ))}
          {[50, 75].map((t) => (
            <line
              key={t}
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={CHROME.baseline}
              strokeDasharray="4 4"
            />
          ))}

          {lines.map((run) =>
            run.length > 1 ? (
              <path
                key={`area-${run[0].i}`}
                d={`${smoothPath(run.map((r) => r.p))} L${run[run.length - 1].p.x},${base} L${run[0].p.x},${base} Z`}
                fill={`url(#area-${id})`}
              />
            ) : null,
          )}
        </g>

        {[0, 50, 75, 100].map((t) => (
          <text
            key={t}
            x={MARGIN.left - 8}
            y={y(t)}
            dy="0.32em"
            textAnchor="end"
            fontSize={11}
            fill={INK.muted}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {t}
          </text>
        ))}

        {/* Band names in the right margin */}
        {BANDS.map((b) => (
          <g
            key={b.band}
            transform={`translate(${MARGIN.left + plotW + 12},${y((b.from + b.to) / 2)})`}
          >
            <circle r={4} cx={4} className={b.fill} />
            <text
              x={13}
              dy="0.32em"
              fontSize={11}
              fontWeight={last?.band === b.band ? 600 : 400}
              fill={last?.band === b.band ? INK.primary : INK.secondary}
            >
              {ISS_BAND[b.band].status}
            </text>
            <text x={13} dy="1.55em" fontSize={10} fill={INK.muted}>
              {ISS_BAND[b.band].range}
            </text>
          </g>
        ))}

        {points.map(
          (m, i) =>
            // Counted back from the newest, so the latest check always has its date.
            (points.length - 1 - i) % labelEvery === 0 && (
              <text
                key={m.at}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
                fontSize={11}
                fill={INK.muted}
              >
                {day(m.at)}
              </text>
            ),
        )}

        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={MARGIN.top}
            y2={base}
            stroke={INK.muted}
            strokeDasharray="2 3"
          />
        )}

        {/* One point only: a guide from the axis so it does not float. */}
        {lines.length === 1 && lines[0].length === 1 && (
          <line
            x1={MARGIN.left}
            x2={lines[0][0].p.x}
            y1={lines[0][0].p.y}
            y2={lines[0][0].p.y}
            stroke={LINE}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            opacity={0.6}
          />
        )}

        {lines.map(
          (run) =>
            run.length > 1 && (
              <path
                key={`line-${run[0].i}`}
                d={smoothPath(run.map((r) => r.p))}
                fill="none"
                stroke={LINE}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ),
        )}

        {points.map(
          (m, i) =>
            m.value !== null &&
            i !== lastIndex && (
              <circle
                key={m.at}
                cx={x(i)}
                cy={y(m.value)}
                r={active === i ? markerR + 1.5 : markerR}
                className={m.band ? DOT[m.band] : 'fill-slate-400'}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            ),
        )}

        {/* The latest score: a halo, a larger marker and its label. */}
        {last && last.value !== null && (
          <g>
            <circle
              cx={x(lastIndex)}
              cy={y(last.value)}
              r={13}
              className={last.band ? DOT[last.band] : 'fill-slate-400'}
              opacity={0.18}
            />
            <circle
              cx={x(lastIndex)}
              cy={y(last.value)}
              r={7}
              fill={CHROME.surface}
              strokeWidth={3}
              className={last.band ? RING[last.band] : 'stroke-slate-400'}
            />
          </g>
        )}
        {callout && (
          <g transform={`translate(${callout.left},${callout.top})`}>
            <rect
              width={callout.w}
              height={22}
              rx={11}
              fill={CHROME.surface}
              strokeWidth={1.5}
              className={RING[callout.band]}
            />
            <circle cx={11} cy={11} r={4} className={DOT[callout.band]} />
            <text x={20} y={11} dy="0.34em" fontSize={11.5} fontWeight={600} fill={INK.primary}>
              {callout.text}
            </text>
          </g>
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          tabIndex={0}
          aria-label={`${label}. Use left and right arrow keys to read each check.`}
          onPointerMove={moveTo}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="outline-none"
        />
      </svg>

      {shown && active !== null && (
        <Tooltip x={x(active)} y={MARGIN.top + 8}>
          <TooltipTitle>{formatDateTime(shown.at)}</TooltipTitle>
          <TooltipRow
            value={shown.value === null ? 'n/a' : String(shown.value)}
            label={shown.band ? ISS_BAND[shown.band].status : 'Not enough data'}
          />
          <div className="mt-1 text-slate-500">FMCSA data: {formatMonth(shown.data_month)}</div>
        </Tooltip>
      )}
    </div>
  )
}
