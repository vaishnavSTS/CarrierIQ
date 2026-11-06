import { useState, type KeyboardEvent, type PointerEvent } from 'react'

import { CHROME, INK } from '../../../components/charts/chartTheme'
import { Tooltip, TooltipRow, TooltipTitle } from '../../../components/charts/Tooltip'
import { useElementWidth } from '../../../components/charts/useElementWidth'
import type { EstimatedIss } from '../../../types/carrierSafety'
import { formatMonth } from '../../../utils/format'
import { ISS_BAND } from './issBand'
import type { IssMonth } from './issMonths'

const MARGIN = { top: 10, right: 16, bottom: 24, left: 32 }
const HEIGHT = 180

/** FMCSA's bands as faint stripes behind the line (1–49, 50–74, 75–100). */
const BANDS = [
  { from: 0, to: 50, fill: 'fill-emerald-600' },
  { from: 50, to: 75, fill: 'fill-amber-600' },
  { from: 75, to: 100, fill: 'fill-red-600' },
] as const

const DOT: Record<NonNullable<EstimatedIss['band']>, string> = {
  PASS: 'fill-emerald-600',
  OPTIONAL: 'fill-amber-600',
  INSPECT: 'fill-red-600',
}

/** The Estimated ISS month by month on a fixed 0–100 scale, over FMCSA's bands. */
export function IssMonthlyChart({ months }: { months: IssMonth[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const step = months.length > 1 ? plotW / (months.length - 1) : 0
  const x = (i: number) => MARGIN.left + (months.length > 1 ? step * i : plotW / 2)
  const y = (v: number) => MARGIN.top + plotH - (v / 100) * plotH
  const labelEvery = Math.max(1, Math.ceil(56 / Math.max(step, 1)))

  let path = ''
  let drawing = false
  months.forEach((m, i) => {
    if (m.value === null) {
      drawing = false
      return
    }
    path += `${drawing ? 'L' : 'M'}${x(i)},${y(m.value)} `
    drawing = true
  })

  function moveTo(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - box.left
    setActive(Math.min(months.length - 1, Math.max(0, Math.round(offset / Math.max(step, 1)))))
  }

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      setActive((i) => Math.min(months.length - 1, Math.max(0, (i ?? months.length - 1) + delta)))
    }
  }

  const shown = active === null ? null : months[active]
  const label = `Estimated ISS by month, ${formatMonth(months[0].month)} to ${formatMonth(
    months[months.length - 1].month,
  )}`

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={width} height={HEIGHT} role="group" aria-label={label}>
        {BANDS.map((b) => (
          <rect
            key={b.from}
            x={MARGIN.left}
            y={y(b.to)}
            width={plotW}
            height={y(b.from) - y(b.to)}
            className={`${b.fill} opacity-10`}
          />
        ))}
        {[0, 50, 75, 100].map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? CHROME.baseline : CHROME.grid}
              strokeDasharray={t === 50 || t === 75 ? '3 3' : undefined}
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
              {t}
            </text>
          </g>
        ))}

        {months.map(
          (m, i) =>
            i % labelEvery === 0 && (
              <text
                key={m.month}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor="middle"
                fontSize={11}
                fill={INK.muted}
              >
                {formatMonth(m.month)}
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

        <path
          d={path.trim()}
          fill="none"
          stroke={INK.secondary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {months.map(
          (m, i) =>
            m.value !== null && (
              <circle
                key={m.month}
                cx={x(i)}
                cy={y(m.value)}
                r={active === i ? 5 : 4}
                className={m.band ? DOT[m.band] : 'fill-slate-400'}
                stroke={CHROME.surface}
                strokeWidth={2}
              />
            ),
        )}

        <rect
          x={MARGIN.left - step / 2}
          y={MARGIN.top}
          width={plotW + step}
          height={plotH}
          fill="transparent"
          tabIndex={0}
          aria-label={`${label}. Use left and right arrow keys to read each month.`}
          onPointerMove={moveTo}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? months.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="outline-none"
        />
      </svg>

      {shown && active !== null && (
        <Tooltip x={x(active)} y={MARGIN.top + 8}>
          <TooltipTitle>{formatMonth(shown.month)}</TooltipTitle>
          <TooltipRow
            value={shown.value === null ? 'n/a' : String(shown.value)}
            label={shown.band ? ISS_BAND[shown.band].status : 'Not enough data'}
          />
          {shown.carried && (
            <div className="mt-1 text-slate-500">Unchanged from the month before</div>
          )}
        </Tooltip>
      )}
    </div>
  )
}
