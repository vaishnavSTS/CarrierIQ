import { CalendarClock, CircleCheck, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

import { mcs150Due, MONTHS } from './HeroTools'

const ease = [0.16, 1, 0.3, 1] as const
const SECONDS = 3 // how long each sample carrier shows

/*
 * The carrier hero's dashboard: a compact sample of the carrier's own portal that turns through
 * three made-up carriers (labelled as samples), so the hero feels alive and fits on one screen.
 * The MCS-150 date is worked out by the real rule (49 CFR 390.19) for each sample's USDOT.
 * The ISS bands match the app: 1–49 Satisfactory, 50–74 At risk, 75–100 High risk.
 */

/** A tile: what it is, its value, one line of detail, and whether it's fine or worth a look. */
type Status = { label: string; value: string; detail: string; ok: boolean }
type Sample = {
  name: string
  usdot: string
  iss: number
  band: { label: string; ring: string; chip: string }
  status: Status[]
  checks: { ok: boolean; text: string }[]
}

const SATISFACTORY = {
  label: 'Satisfactory',
  ring: 'stroke-emerald-500',
  chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}
const AT_RISK = {
  label: 'At risk',
  ring: 'stroke-amber-500',
  chip: 'bg-amber-50 text-amber-800 ring-amber-200',
}

const SAMPLES: Sample[] = [
  {
    name: 'EXAMPLE FREIGHT LLC',
    usdot: '1234567',
    iss: 42,
    band: SATISFACTORY,
    status: [
      { label: 'Authority', value: 'Active', detail: 'Held for 6 years', ok: true },
      { label: 'Liability', value: '$1,000,000', detail: 'On file · $750,000 required', ok: true },
      { label: 'Inspections', value: '31', detail: 'Last 24 months', ok: true },
    ],
    checks: [
      { ok: true, text: 'Authority active for over 2 years' },
      { ok: true, text: 'Liability of $1,000,000 on file' },
      { ok: false, text: 'Phone number shared with 1 other carrier' },
    ],
  },
  {
    name: 'SAMPLE HAULING CO',
    usdot: '2345678',
    iss: 63,
    band: AT_RISK,
    status: [
      { label: 'Authority', value: '4 months', detail: 'Active, but new', ok: false },
      { label: 'Insurance', value: 'Renews soon', detail: 'Expected within 30 days', ok: false },
      { label: 'Inspections', value: '2', detail: 'Too few to judge', ok: false },
    ],
    checks: [
      { ok: false, text: 'Authority only 4 months old' },
      { ok: false, text: 'Insurance renewal due within 30 days' },
      { ok: true, text: 'No out-of-service order' },
    ],
  },
  {
    name: 'DEMO LINES INC',
    usdot: '3456781',
    iss: 18,
    band: SATISFACTORY,
    status: [
      { label: 'Fleet', value: '48 trucks', detail: '52 drivers', ok: true },
      { label: 'Vehicle OOS', value: '9.8%', detail: 'National average 22.3%', ok: true },
      { label: 'Crashes', value: '0', detail: 'Last 24 months', ok: true },
    ],
    checks: [
      { ok: true, text: 'Out-of-service rates under the national average' },
      { ok: true, text: 'No crashes in the last 24 months' },
      { ok: true, text: 'Nothing shared with other carriers' },
    ],
  },
]

/** The Estimated ISS as a ring that fills to its share of 100. */
function IssRing({ value, ring }: { value: number; ring: string }) {
  const r = 30
  const length = 2 * Math.PI * r
  return (
    <span className="relative grid size-[4.5rem] shrink-0 place-items-center">
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-slate-200" />
        <motion.circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={length}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - value / 100) }}
          transition={{ duration: 1.1, ease }}
          className={ring}
        />
      </svg>
      <span className="text-xl font-semibold tabular-nums text-slate-950">{value}</span>
    </span>
  )
}

/** Fades its content over when `id` changes. */
function Swap({
  id,
  children,
  className = '',
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3, ease }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

const LABEL = 'font-label text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500'

export function CarrierHeroBoard() {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // The visitor's own USDOT: once typed, the deadline card is theirs and the samples stop turning.
  const [own, setOwn] = useState('')
  const sample = SAMPLES[index]
  const usdot = own.length >= 2 ? own : sample.usdot
  const due = mcs150Due(usdot)
  const lastDay = due ? new Date(due.year, due.month + 1, 0).getDate() : 0

  useEffect(() => {
    if (reduceMotion || paused || own) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SAMPLES.length), SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduceMotion, own])

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.1, ease }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative rounded-[1.75rem] bg-white/10 p-2.5 text-left shadow-2xl shadow-black/30 ring-1 ring-white/25 backdrop-blur-md md:p-3"
    >
      {/* The window's top bar: which sample carrier is showing, and dots to pick one. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2.5 pt-0.5 text-white">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
          <span className="size-2.5 rounded-full bg-white/40" />
        </span>
        <Swap id={sample.usdot} className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">{sample.name}</span>
          <span className="font-mono text-xs text-white/75">USDOT {sample.usdot}</span>
        </Swap>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-white/85 md:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Checked just now
          </span>
          <span className="hidden rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/30 sm:inline">
            Sample carriers · example data
          </span>
          <span role="tablist" aria-label="Sample carriers" className="flex gap-1">
            {SAMPLES.map((s, i) => (
              <button
                key={s.usdot}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={s.name}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-amber-300' : 'w-2 bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </span>
        </span>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-2.5">
          <ul className="grid grid-cols-3 gap-2.5">
            {sample.status.map((s, i) => {
              return (
                <li key={i} className="rounded-2xl bg-surface px-3.5 py-3 shadow-sm">
                  <Swap id={`${sample.usdot}-${i}-label`}>
                    <div className={LABEL}>{s.label}</div>
                  </Swap>
                  <Swap id={`${sample.usdot}-${i}`} className="mt-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${
                        s.ok
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-amber-50 text-amber-800 ring-amber-200'
                      }`}
                    >
                      {s.ok ? (
                        <CircleCheck className="size-3.5" aria-hidden />
                      ) : (
                        <TriangleAlert className="size-3.5" aria-hidden />
                      )}
                      {s.value}
                    </span>
                    <div className="mt-1.5 text-xs text-slate-500">{s.detail}</div>
                  </Swap>
                </li>
              )
            })}
          </ul>

          <div className="grid gap-2.5 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-3.5 rounded-2xl bg-surface px-4 py-3 shadow-sm">
              <IssRing value={sample.iss} ring={sample.band.ring} />
              <div>
                <div className={LABEL}>Estimated ISS</div>
                <Swap id={`${sample.usdot}-band`}>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${sample.band.chip}`}
                  >
                    {sample.band.label}
                  </span>
                </Swap>
                <div className="mt-1 text-[11px] text-slate-500">1–100 · lower is better</div>
              </div>
            </div>

            <div className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
              <div className={LABEL}>What a broker’s check sees</div>
              <Swap id={`${sample.usdot}-checks`}>
                <ul className="mt-2 space-y-1.5">
                  {sample.checks.map(({ ok, text }) => (
                    <li key={text} className="flex items-start gap-2 text-sm text-slate-700">
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
                      {text}
                    </li>
                  ))}
                </ul>
              </Swap>
            </div>
          </div>
        </div>

        {/* The MCS-150 deadline for the sample on show, by the real rule. */}
        <div className="flex flex-col rounded-2xl bg-surface px-4 py-3.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#101853] text-amber-300">
              <CalendarClock className="size-4" aria-hidden />
            </span>
            <div className="text-sm font-semibold text-slate-950">Next MCS-150 update</div>
          </div>
          <label className="mt-3 block">
            <span className="sr-only">Your USDOT number</span>
            <input
              inputMode="numeric"
              placeholder="Type your USDOT number"
              value={own}
              maxLength={8}
              onChange={(e) => setOwn(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-slate-300 bg-canvas px-3 py-2 font-mono text-sm tracking-wider text-slate-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
            />
          </label>
          <Swap id={`${usdot}-due`} className="mt-2.5 flex-1">
            {due && (
              <div className="rounded-xl bg-[#101853] px-4 py-3 text-white">
                <div className="text-xs text-white/70">
                  {own.length >= 2 ? 'Your next update is due by' : `USDOT ${usdot} is due by`}
                </div>
                <div className="mt-0.5 text-2xl font-semibold [font-family:var(--font-display)]">
                  {MONTHS[due.month]} {lastDay}, {due.year}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    Last digit <b className="font-mono text-amber-300">{usdot.slice(-1)}</b> →{' '}
                    {MONTHS[due.month]}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5">
                    Next-to-last <b className="font-mono text-amber-300">{usdot.slice(-2, -1)}</b> →{' '}
                    {due.year % 2 ? 'odd' : 'even'} years
                  </span>
                </div>
              </div>
            )}
          </Swap>
          <p className="mt-2.5 text-[11px] leading-snug text-slate-500">
            Every carrier updates its MCS-150 every two years, even if nothing changed. Missing it
            can get your USDOT number deactivated.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
