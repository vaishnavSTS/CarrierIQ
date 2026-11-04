import { Paperclip } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

import { MINIMUMS } from './HeroTools'

const ease = [0.16, 1, 0.3, 1] as const

/*
 * The insurance agent hero's "underwriting file": a paper folder on a desk, with a tab for each
 * thing underwriting checks. The minimum is a real reference (49 CFR 387); the other tabs show a
 * made-up carrier, stamped as a sample. The paper stays cream in both themes, with its own ink.
 */

type Tab = 'minimum' | 'filings' | 'crashes' | 'fleet'

const TABS: { key: Tab; label: string }[] = [
  { key: 'minimum', label: 'Minimum' },
  { key: 'filings', label: 'Filings' },
  { key: 'crashes', label: 'Crashes' },
  { key: 'fleet', label: 'Fleet' },
]

const INK = 'text-[#1c2340]'
const INK_SOFT = 'text-[#4a5170]'

/** One labelled line on the file, like a typed form field. */
function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 border-b border-dashed border-[#d9cfb8] py-2.5 last:border-0">
      <dt
        className={`font-label text-[10.5px] font-semibold uppercase tracking-[0.12em] ${INK_SOFT}`}
      >
        {label}
      </dt>
      <dd className={`text-sm ${INK}`}>
        <span className="font-semibold">{value}</span>
        {note && <span className={`mt-0.5 block text-xs ${INK_SOFT}`}>{note}</span>}
      </dd>
    </div>
  )
}

function MinimumPanel() {
  const [key, setKey] = useState<(typeof MINIMUMS)[number]['key']>('general')
  const pick = MINIMUMS.find((m) => m.key === key) ?? MINIMUMS[0]
  return (
    <div>
      <p className={`text-sm font-semibold ${INK}`}>What liability minimum applies?</p>
      <div role="radiogroup" aria-label="Kind of carrier" className="mt-3 flex flex-wrap gap-1.5">
        {MINIMUMS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={m.key === key}
            onClick={() => setKey(m.key)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
              m.key === key
                ? 'bg-[#101853] text-white ring-[#101853]'
                : `bg-white/60 ${INK} ring-[#cdbf9f] hover:bg-white`
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl border-2 border-[#101853] bg-white/70 px-4 py-3">
        <div className={`text-xs ${INK_SOFT}`}>Federal minimum liability (BI&PD)</div>
        <div className="mt-0.5 text-3xl font-semibold tabular-nums text-[#101853] [font-family:var(--font-display)]">
          ${pick.amount.toLocaleString('en-US')}
        </div>
        <div className={`mt-1 text-xs ${INK_SOFT}`}>{pick.detail}</div>
      </div>
      <p className={`mt-3 text-xs ${INK_SOFT}`}>
        49 CFR 387, for-hire carriers in interstate commerce. Many shippers and brokers ask for
        more, often $1,000,000.
      </p>
    </div>
  )
}

function Panel({ tab }: { tab: Tab }) {
  if (tab === 'minimum') return <MinimumPanel />
  if (tab === 'filings')
    return (
      <dl>
        <Line label="Liability (BI&PD)" value="$1,000,000 on file" note="Required: $750,000" />
        <Line label="Cargo" value="On file" />
        <Line label="BOC-3" value="Process agent on file" />
        <Line
          label="Expected renewal"
          value="March"
          note="An estimate from past filing dates; no official date is published"
        />
      </dl>
    )
  if (tab === 'crashes')
    return (
      <dl>
        <Line label="Crashes, 24 months" value="1" note="0 fatal" />
        <Line label="Vehicle out of service" value="14.8%" note="National average 22.3%" />
        <Line label="Driver out of service" value="4.1%" note="National average 6.7%" />
        <Line
          label="Estimated ISS"
          value="42 · Satisfactory"
          note="An estimate, not FMCSA’s official score"
        />
      </dl>
    )
  return (
    <dl>
      <Line label="Power units" value="12 registered" note="11 seen on inspections" />
      <Line
        label="Trucks by VIN"
        value="2021 Freightliner Cascadia × 6"
        note="Decoded from the VIN"
      />
      <Line label="Trailers" value="18 seen on inspections" />
      <Line label="VINs elsewhere" value="None under another USDOT" />
    </dl>
  )
}

export function AgentHeroFile() {
  const [tab, setTab] = useState<Tab>('minimum')
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -1.2 }}
      transition={{ duration: 0.9, delay: 0.1, ease }}
      className="relative mx-auto w-full max-w-lg pt-8"
    >
      {/* Two sheets fanned out behind the file. */}
      <div
        aria-hidden
        className="absolute inset-x-6 bottom-3 top-12 rotate-[5deg] rounded-2xl bg-[#f3ead6] shadow-xl"
      />
      <div
        aria-hidden
        className="absolute inset-x-3 bottom-1 top-10 -rotate-[4deg] rounded-2xl bg-[#f8f1e0] shadow-xl"
      />

      {/* The folder's tab, sticking up above it. */}
      <div className="absolute left-6 top-0 z-10 rounded-t-xl bg-[#e7c98a] px-4 pb-3 pt-2 shadow-md">
        <span className="font-label text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#4a3510]">
          Underwriting file
        </span>
      </div>

      <div className="relative z-20 rounded-2xl rounded-tl-none bg-[#fffaf0] p-5 shadow-2xl shadow-black/40 ring-1 ring-[#e3d6b8] md:p-6">
        <Paperclip
          aria-hidden
          className="absolute -top-4 right-10 size-9 rotate-[20deg] text-slate-400"
        />

        {/* The file's heading, like a typed label. */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-[#101853]/80 pb-3">
          <div>
            <div className={`font-mono text-[11px] uppercase tracking-wider ${INK_SOFT}`}>
              Insured · carrier
            </div>
            <div className={`text-lg font-semibold ${INK} [font-family:var(--font-display)]`}>
              Example Freight LLC
            </div>
            <div className={`font-mono text-xs ${INK_SOFT}`}>USDOT 1234567</div>
          </div>
          <span className="font-label mt-1 -rotate-6 rounded-md border-2 border-red-600/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-red-600/90">
            Sample
          </span>
        </div>

        <div role="tablist" aria-label="Parts of the file" className="mt-4 flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === key ? 'bg-[#101853] text-white' : `${INK_SOFT} hover:bg-[#f1e6cc]`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="relative mt-4 min-h-[15.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease }}
            >
              <Panel tab={tab} />
            </motion.div>
          </AnimatePresence>
        </div>

        <p
          className={`mt-2 border-t border-[#e3d6b8] pt-3 text-[11px] leading-relaxed ${INK_SOFT}`}
        >
          A sample carrier with example data. In the portal, every carrier you look up gets this
          file, and a dated Safety Score Report to keep with the quote.
        </p>
      </div>
    </motion.div>
  )
}
