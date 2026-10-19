import { motion, useReducedMotion } from 'motion/react'

import { AnimatedNumber } from '../../../components/AnimatedNumber'
import { StatusBadge } from '../../../components/StatusBadge'
import type { EstimatedIss } from '../../../types/carrierSafety'
import { ISS_BAND } from './issBand'

const CX = 100
const CY = 100
const R = 78
const WIDTH = 16

/** FMCSA's ISS bands along the dial, left (1) to right (100); the edges sit between values. */
const SEGMENTS = [
  { band: 'PASS', from: 0, to: 49.5, color: 'text-emerald-600' },
  { band: 'OPTIONAL', from: 49.5, to: 74.5, color: 'text-amber-600' },
  { band: 'INSPECT', from: 74.5, to: 100, color: 'text-red-600' },
] as const

/** Values written around the outside of the dial: the ends and the band edges. */
const LABELS = [1, 50, 75, 100]

/** A point on the half circle: 0 at the left end, 100 at the right. */
function point(value: number, radius = R): [number, number] {
  const angle = Math.PI * (1 - value / 100)
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)]
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

/**
 * The Estimated ISS (1–100, lower is better) on a half-circle dial coloured by FMCSA's bands:
 * the carrier's band glows, the others fade, and a marker sweeps to the value. With too little
 * data the dial is grey with no marker, so no score is implied.
 */
export function IssGauge({
  iss,
  className = 'w-52',
}: {
  iss: EstimatedIss | null | undefined
  /** Width of the dial */
  className?: string
}) {
  const reduce = useReducedMotion()
  const value = iss?.value ?? null
  const band = iss?.band ? ISS_BAND[iss.band] : null
  const scored = value !== null && band !== null
  const active = SEGMENTS.find((s) => s.band === iss?.band)
  const degrees = scored ? (Math.min(Math.max(value, 1), 100) / 100) * 180 : 0

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${className}`}>
        <svg
          viewBox="0 0 200 112"
          className="w-full overflow-visible"
          role="img"
          aria-label={
            scored
              ? `Estimated ISS ${value} of 100, ${band.status}. Lower is better.`
              : 'Estimated ISS: not enough data'
          }
        >
          {/* Track under the bands, so the gaps between them read as one dial */}
          <path d={arc(0, 100)} fill="none" strokeWidth={WIDTH + 6} className="stroke-slate-100" />
          {SEGMENTS.map((s) => {
            const current = scored && s.band === iss?.band
            return (
              <path
                key={s.band}
                d={arc(s.from + (s.from ? 0.9 : 0), s.to - (s.to < 100 ? 0.9 : 0))}
                fill="none"
                stroke="currentColor"
                strokeWidth={WIDTH}
                className={
                  !scored
                    ? 'text-slate-300'
                    : `${s.color} ${current ? 'drop-shadow-[0_0_6px_currentColor] print:drop-shadow-none' : 'opacity-25'}`
                }
              />
            )
          })}
          {/* Minor ticks inside the dial, every 5 */}
          {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => {
            const [x1, y1] = point(v, R - WIDTH / 2 - 4)
            const [x2, y2] = point(v, R - WIDTH / 2 - (v % 25 === 0 ? 10 : 7))
            return (
              <line
                key={v}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={v % 25 === 0 ? 1.4 : 0.8}
                className="stroke-slate-400"
              />
            )
          })}
          {LABELS.map((v) => {
            const [x, y] = point(v, R + WIDTH / 2 + 9)
            return (
              <text
                key={v}
                x={x}
                y={y + 3}
                textAnchor="middle"
                className="fill-slate-500 text-[9px] font-medium tabular-nums"
              >
                {v}
              </text>
            )
          })}
          {scored && active && (
            <motion.g
              initial={{ rotate: reduce ? degrees : 0 }}
              animate={{ rotate: degrees }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ originX: `${CX}px`, originY: `${CY}px`, transformBox: 'view-box' }}
            >
              <circle
                cx={CX - R}
                cy={CY}
                r={WIDTH / 2 + 3}
                stroke="currentColor"
                strokeWidth={4}
                className={`fill-surface ${active.color} drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)] print:drop-shadow-none`}
              />
              <circle cx={CX - R} cy={CY} r={3} fill="currentColor" className={active.color} />
            </motion.g>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center leading-none">
          <span className="text-4xl font-bold tracking-tight text-slate-950">
            {scored ? <AnimatedNumber value={value} /> : '—'}
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            of 100
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-col items-center gap-1">
        {scored ? (
          <StatusBadge label={band.status} tone={band.tone} />
        ) : (
          <StatusBadge label="Not enough data" tone="neutral" />
        )}
        <span className="text-[11px] text-slate-500">Lower is better</span>
      </div>
    </div>
  )
}
