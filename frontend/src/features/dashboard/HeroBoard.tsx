import {
  BadgeAlert,
  Copy,
  FileWarning,
  Gauge,
  IdCard,
  Pause,
  Play,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

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

const COLUMNS = 4
const PER_COLUMN = 6

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
 * Hero background, after the moving load board on vektortms.com: a tilted 3D board of carrier
 * signal cards drifting in columns, with glowing routes and moving dots. Built from this app's
 * own newest signals. Decorative only (hidden from screen readers); a button pauses it, and it
 * starts paused for people who prefer reduced motion.
 */
export function HeroBoard({ signals }: { signals: RecentSignal[] | undefined }) {
  const reduce = useReducedMotion()
  const [paused, setPaused] = useState(Boolean(reduce))
  const routes = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (paused) routes.current?.pauseAnimations()
    else routes.current?.unpauseAnimations()
  }, [paused])

  const source = signals && signals.length > 0 ? signals : PLACEHOLDER
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: PER_COLUMN }, (_, i) => source[(c * 3 + i) % source.length]),
  )

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 right-0 hidden w-[72%] [perspective:1400px] md:block">
          <div
            className={`hero-board absolute left-[-10%] top-[-55%] h-[210%] w-[150%] [transform:rotateX(52deg)_rotateZ(-26deg)] [transform-style:preserve-3d] ${paused ? 'is-paused' : ''}`}
          >
            <svg
              ref={routes}
              className="absolute inset-0 size-full"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="route-glow" x1="0" x2="1">
                  <stop offset="0" stopColor="#a78bfa" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#c4b5fd" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[
                'M -50 820 C 220 640, 380 760, 560 520 S 860 260, 1050 180',
                'M -50 380 C 160 470, 330 300, 520 360 S 820 640, 1050 560',
                'M 120 1050 C 260 820, 520 900, 640 700 S 760 380, 980 -40',
              ].map((d, i) => (
                <g key={d}>
                  <path d={d} fill="none" stroke="#8b5cf6" strokeOpacity="0.25" strokeWidth="10" />
                  <path
                    d={d}
                    fill="none"
                    stroke="url(#route-glow)"
                    strokeWidth="3"
                    strokeDasharray="14 18"
                    className="route-dash"
                  />
                  <circle r="9" fill="#f5d0fe">
                    <animateMotion dur={`${11 + i * 4}s`} repeatCount="indefinite" path={d} />
                  </circle>
                  <circle r="22" fill="#c084fc" opacity="0.25">
                    <animateMotion dur={`${11 + i * 4}s`} repeatCount="indefinite" path={d} />
                  </circle>
                </g>
              ))}
            </svg>

            <div className="absolute inset-0 flex justify-center gap-6">
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
        {/* Keeps the headline and search readable over the board, like Vektor's left fade. */}
        <div className="absolute inset-0 bg-gradient-to-r from-surface from-35% via-surface/85 via-55% to-surface/10" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface to-transparent" />
        <div className="absolute -left-24 -top-32 size-96 rounded-full bg-violet-600/25 blur-3xl" />
      </div>

      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? 'Play background animation' : 'Pause background animation'}
        className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full border border-slate-300 bg-surface/70 text-slate-600 backdrop-blur hover:text-slate-900"
      >
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </button>
    </>
  )
}
