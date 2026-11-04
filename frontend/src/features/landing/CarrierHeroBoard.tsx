import { CircleCheck, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'

import { HeroTool } from './HeroTools'

const ease = [0.16, 1, 0.3, 1] as const

/** A made-up carrier, the same one the portal tour's sample screens use. */
const STATUS = [
  { label: 'Operating authority', value: 'Active', ok: true },
  { label: 'Liability insurance', value: 'On file', ok: true },
  { label: 'BOC-3 process agent', value: 'On file', ok: true },
]

const BROKER_SEES = [
  { ok: true, text: 'Authority active for over 2 years' },
  { ok: true, text: 'Liability of $1,000,000 on file' },
  { ok: true, text: 'Out-of-service rates under the national average' },
  { ok: false, text: 'Phone number shared with 1 other carrier' },
]

const ISS = 42

/** The Estimated ISS as a ring filled to its share of 100. */
function IssRing() {
  const r = 34
  const length = 2 * Math.PI * r
  return (
    <span className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-slate-200" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={length}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - ISS / 100) }}
          transition={{ duration: 1.4, delay: 0.4, ease }}
          className="stroke-emerald-500"
        />
      </svg>
      <span className="text-2xl font-semibold tabular-nums text-slate-950">{ISS}</span>
    </span>
  )
}

/**
 * The carrier hero's dashboard: a sample of the carrier's own portal (a made-up carrier, labelled
 * as such) with the MCS-150 tool as one of its cards, so the hero reads as "this is your company".
 */
export function CarrierHeroBoard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.15, ease }}
      className="relative rounded-[2rem] bg-white/10 p-3 shadow-2xl shadow-black/30 ring-1 ring-white/25 backdrop-blur-md md:p-4"
    >
      {/* The window's top bar. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-3 pt-1 text-white">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
        </span>
        <span className="text-sm font-semibold">EXAMPLE FREIGHT LLC</span>
        <span className="font-mono text-xs text-white/75">USDOT 1234567</span>
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/30">
          Sample carrier · example data
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <div className="grid gap-3">
          <ul className="grid gap-3 sm:grid-cols-3">
            {STATUS.map(({ label, value }) => (
              <li key={label} className="rounded-2xl bg-surface p-4 text-left shadow-sm">
                <div className="font-label text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {label}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <CircleCheck className="size-3.5" aria-hidden />
                  {value}
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-4 rounded-2xl bg-surface p-4 text-left shadow-sm sm:flex-col sm:justify-center sm:text-center">
              <IssRing />
              <div>
                <div className="font-label text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Estimated ISS
                </div>
                <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  Satisfactory
                </div>
                <div className="mt-1 text-[11px] text-slate-500">1–100 · lower is better</div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface p-4 text-left shadow-sm">
              <div className="font-label text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                What a broker’s check sees
              </div>
              <ul className="mt-3 space-y-2.5">
                {BROKER_SEES.map(({ ok, text }, i) => (
                  <motion.li
                    key={text}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.12, ease }}
                    className="flex items-start gap-2.5 text-sm text-slate-700"
                  >
                    {ok ? (
                      <CircleCheck
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                        aria-hidden
                      />
                    ) : (
                      <TriangleAlert
                        className="mt-0.5 size-4 shrink-0 text-amber-600"
                        aria-hidden
                      />
                    )}
                    <span>
                      {text}
                      {!ok && (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Fraud screens may flag it. Your page shows which carrier and what to do.
                        </span>
                      )}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* The real MCS-150 tool, as the dashboard's deadline card. */}
        <HeroTool audience="carrier" />
      </div>
    </motion.div>
  )
}
