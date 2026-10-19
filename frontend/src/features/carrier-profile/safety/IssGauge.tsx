import { StatusBadge } from '../../../components/StatusBadge'
import type { EstimatedIss } from '../../../types/carrierSafety'
import { ISS_BAND } from './issBand'

const CX = 60
const CY = 58
const R = 46

/** FMCSA's ISS bands along the dial, left (1) to right (100); the edges sit between values. */
const SEGMENTS = [
  { band: 'PASS', from: 0, to: 49.5, stroke: 'stroke-emerald-600' },
  { band: 'OPTIONAL', from: 49.5, to: 74.5, stroke: 'stroke-amber-600' },
  { band: 'INSPECT', from: 74.5, to: 100, stroke: 'stroke-red-600' },
] as const

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
 * the carrier's band is drawn solid, the needle points at the value. With too little data the
 * dial is grey with no needle, so no score is implied.
 */
export function IssGauge({
  iss,
  className = 'w-44',
}: {
  iss: EstimatedIss | null | undefined
  /** Width of the dial */
  className?: string
}) {
  const value = iss?.value ?? null
  const band = iss?.band ? ISS_BAND[iss.band] : null
  const scored = value !== null && band !== null
  const [nx, ny] = scored ? point(Math.min(Math.max(value, 1), 100), R - 12) : [CX, CY]

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 120 80"
        className={className}
        role="img"
        aria-label={
          scored
            ? `Estimated ISS ${value} of 100, ${band.status}. Lower is better.`
            : 'Estimated ISS: not enough data'
        }
      >
        {SEGMENTS.map((s) => (
          <path
            key={s.band}
            d={arc(s.from + (s.from ? 0.8 : 0), s.to - (s.to < 100 ? 0.8 : 0))}
            fill="none"
            strokeWidth={10}
            className={
              !scored
                ? 'stroke-slate-300'
                : `${s.stroke} ${iss?.band === s.band ? '' : 'opacity-30'}`
            }
          />
        ))}
        <text x={CX - R} y={CY + 10} textAnchor="middle" className="fill-slate-500 text-[7px]">
          1
        </text>
        <text x={CX + R} y={CY + 10} textAnchor="middle" className="fill-slate-500 text-[7px]">
          100
        </text>
        {scored && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              strokeWidth={2.5}
              strokeLinecap="round"
              className="stroke-slate-900"
            />
            <circle cx={CX} cy={CY} r={3.5} className="fill-slate-900" />
          </>
        )}
        <text
          x={CX}
          y={CY + 20}
          textAnchor="middle"
          className="fill-slate-950 text-[15px] font-semibold tabular-nums"
        >
          {scored ? value : '—'}
        </text>
      </svg>
      <div className="mt-1 flex flex-col items-center gap-1">
        {scored ? (
          <StatusBadge label={band.status} tone={band.tone} />
        ) : (
          <StatusBadge label="Not enough data" tone="neutral" />
        )}
        <span className="text-[11px] text-slate-500">1–100 · lower is better</span>
      </div>
    </div>
  )
}
