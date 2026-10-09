import {
  BadgeAlert,
  Copy,
  FileWarning,
  Gauge,
  IdCard,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

import type { RecentSignal } from '../../types/dashboard'

const TYPE: Record<string, { icon: LucideIcon; label: string }> = {
  AUTHORITY_CHANGE: { icon: BadgeAlert, label: 'Authority' },
  INSURANCE_CHANGE: { icon: FileWarning, label: 'Insurance' },
  IDENTITY_CHANGE: { icon: IdCard, label: 'Identity' },
  SAFETY_TREND: { icon: TrendingUp, label: 'Safety' },
  FLEET_CONSISTENCY: { icon: Gauge, label: 'Fleet' },
  SHARED_VIN: { icon: Copy, label: 'Shared VIN' },
}

const SEVERITY: Record<string, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-violet-400',
}

// Shown before the first signals load, or when there are none: what CarrierIQ checks.
const PLACEHOLDER: RecentSignal[] = [
  ['AUTHORITY_CHANGE', 'Operating authority status'],
  ['INSURANCE_CHANGE', 'Insurance filings on file'],
  ['SHARED_VIN', 'Equipment seen under other USDOTs'],
  ['SAFETY_TREND', 'Out-of-service rate trend'],
  ['FLEET_CONSISTENCY', 'Registered vs. inspected fleet'],
  ['IDENTITY_CHANGE', 'Name, address and phone history'],
].map(([type, title], i) => ({
  id: -1 - i,
  usdot_number: 0,
  legal_name: 'Checked for every carrier',
  signal_type: type,
  severity: 'LOW',
  title,
  detected_at: null,
}))

// Enough cards that every column runs past the bottom of the screen, even mid-loop.
const COLUMNS = 10
const PER_COLUMN = 16

/** Roads across the board (viewBox 0–1000). Each carries a few trucks and cars. */
const ROUTES = [
  'M -50 820 C 220 640, 380 760, 560 520 S 860 260, 1050 180',
  'M -50 380 C 160 470, 330 300, 520 360 S 820 640, 1050 560',
  'M 120 1050 C 260 820, 520 900, 640 700 S 760 380, 980 -40',
  'M -50 140 C 200 240, 420 90, 600 190 S 900 330, 1050 270',
  'M 300 -50 C 340 200, 180 420, 300 620 S 480 900, 420 1050',
  'M -50 640 C 180 580, 300 720, 470 660 S 760 480, 1050 430',
  'M 700 1050 C 760 860, 900 820, 880 640 S 760 300, 860 -50',
  'M -50 960 C 260 900, 520 1000, 760 900 S 960 820, 1050 860',
]

/** A small truck (trailer + cab) pointing along +x, centred on 0,0. */
function Truck() {
  return (
    <g>
      <ellipse rx="22" ry="11" fill="#a78bfa" opacity="0.35" />
      <rect x="-17" y="-6" width="22" height="12" rx="2" fill="#ede9fe" />
      <rect x="6" y="-5" width="10" height="10" rx="2.5" fill="#c4b5fd" />
      <rect x="12" y="-4" width="3" height="8" rx="1" fill="#4c1d95" />
    </g>
  )
}

/** A small car pointing along +x, centred on 0,0. */
function Car() {
  return (
    <g>
      <ellipse rx="13" ry="8" fill="#f0abfc" opacity="0.3" />
      <rect x="-8" y="-4.5" width="16" height="9" rx="3.5" fill="#f5d0fe" />
      <rect x="-3" y="-3" width="6" height="6" rx="1.5" fill="#86198f" opacity="0.55" />
      <circle cx="8" cy="-2.6" r="1.1" fill="#fff7d6" />
      <circle cx="8" cy="2.6" r="1.1" fill="#fff7d6" />
    </g>
  )
}

function Card({ signal }: { signal: RecentSignal }) {
  const { icon: Icon, label } = TYPE[signal.signal_type] ?? TYPE.AUTHORITY_CHANGE
  return (
    <div className="w-64 rounded-2xl border border-violet-300/20 bg-[#2b2150]/90 p-3 shadow-[0_18px_40px_-12px_rgba(76,29,149,0.65)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200/80">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span className={`h-1.5 w-8 rounded-full ${SEVERITY[signal.severity] ?? SEVERITY.LOW}`} />
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-white">
        {signal.title}
      </div>
      <div className="mt-1.5 truncate text-xs text-violet-200/70">
        {signal.legal_name}
        {signal.usdot_number > 0 && ` · USDOT ${signal.usdot_number}`}
      </div>
    </div>
  )
}

/**
 * Dashboard background, after the moving load board on vektortms.com: a tilted 3D board of
 * carrier signal cards drifting in columns across the whole page, with glowing roads carrying
 * trucks and cars, behind the dashboard's see-through cards. Built from this app's own newest signals.
 * Decorative only (hidden from screen readers); it holds still for people who prefer reduced
 * motion.
 */
export function HeroBoard({ signals }: { signals: RecentSignal[] | undefined }) {
  const reduce = useReducedMotion()
  const routes = useRef<SVGSVGElement>(null)

  useEffect(() => {
    // Card columns and route dashes stop through CSS; the vehicles are SVG animations.
    if (reduce) routes.current?.pauseAnimations()
    else routes.current?.unpauseAnimations()
  }, [reduce])

  const source = signals && signals.length > 0 ? signals : PLACEHOLDER
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: PER_COLUMN }, (_, i) => source[(c * 3 + i) % source.length]),
  )

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 hidden [perspective:1400px] md:block">
        <div className="hero-board absolute left-[-30%] top-[-70%] h-[240%] w-[160%] [transform:rotateX(52deg)_rotateZ(-26deg)] [transform-style:preserve-3d]">
          <svg
            ref={routes}
            className="absolute inset-0 z-10 size-full"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="route-glow" x1="0" x2="1">
                <stop offset="0" stopColor="#a78bfa" stopOpacity="0" />
                <stop offset="0.5" stopColor="#c4b5fd" stopOpacity="0.9" />
                <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ROUTES.map((d, r) => {
              const duration = 16 + (r % 4) * 5
              return (
                <g key={d}>
                  <path d={d} fill="none" stroke="#8b5cf6" strokeOpacity="0.22" strokeWidth="14" />
                  <path
                    d={d}
                    fill="none"
                    stroke="url(#route-glow)"
                    strokeWidth="2.5"
                    strokeDasharray="14 18"
                    className="route-dash"
                  />
                  {[0, 1, 2].map((v) => {
                    // Odd routes run the other way; vehicles are spread along each road.
                    const reverse = r % 2 === 1
                    return (
                      <g key={v}>
                        {(r + v) % 3 === 0 ? <Car /> : <Truck />}
                        <animateMotion
                          dur={`${duration}s`}
                          begin={`-${(v * duration) / 3}s`}
                          repeatCount="indefinite"
                          path={d}
                          rotate={reverse ? 'auto-reverse' : 'auto'}
                          keyPoints={reverse ? '1;0' : '0;1'}
                          keyTimes="0;1"
                          calcMode="linear"
                        />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>

          <div className="absolute inset-0 flex justify-around">
            {columns.map((cards, c) => (
              <div
                key={c}
                className={`board-column flex flex-col gap-6 ${c % 2 ? 'reverse' : ''}`}
                style={{ animationDuration: `${46 + c * 9}s` }}
              >
                {[...cards, ...cards].map((s, i) => (
                  <Card key={`${s.id}-${i}`} signal={s} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* A light tint and soft edges keep the board behind the cards, not competing with them. */}
      <div className="absolute inset-0 bg-canvas/40" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-canvas to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-canvas to-transparent" />
    </div>
  )
}
