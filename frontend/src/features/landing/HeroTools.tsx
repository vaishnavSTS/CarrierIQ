import {
  CalendarClock,
  CircleCheck,
  CircleX,
  ShieldCheck,
  ShieldHalf,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'

import type { Audience } from '../audience/audience'

/**
 * The tool beside each audience's hero: a quick, real answer to something that audience checks
 * all the time. Carriers: when the MCS-150 update is due (49 CFR 390.19). Brokers: a quick
 * booking check by the portal's own rules (features/compare/vetting.ts). Insurance agents: the
 * federal liability minimum for the kind of carrier (49 CFR 387.9 and 387.33).
 */
export function HeroTool({ audience }: { audience: Audience }) {
  if (audience === 'broker') return <BookingCheckTool />
  if (audience === 'agent') return <MinimumTool />
  return <Mcs150Tool />
}

const ease = [0.16, 1, 0.3, 1] as const

function ToolCard({
  icon: Icon,
  label,
  title,
  children,
  footer,
}: {
  icon: LucideIcon
  label: string
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      className="relative"
    >
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-amber-300/25 to-violet-500/20 blur-2xl"
      />
      <div className="relative rounded-3xl border border-white/40 bg-surface p-6 text-left shadow-2xl md:p-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101853] text-amber-300">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <div className="font-label text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
              {label}
            </div>
            <div className="text-lg font-semibold text-slate-950 [font-family:var(--font-display)]">
              {title}
            </div>
          </div>
        </div>
        <div className="mt-5">{children}</div>
        <div className="mt-5 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          {footer}
        </div>
      </div>
    </motion.div>
  )
}

/** A result that animates in whenever `id` changes. */
function Result({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="relative min-h-[7.5rem]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// --- Carriers: MCS-150 due date ------------------------------------------------------------------

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * 49 CFR 390.19(b): the update is due every 24 months, in the month named by the USDOT number's
 * last digit (1 = January … 9 = September, 0 = October), in odd-numbered years when the
 * next-to-last digit is odd and even-numbered years when it is even. Due by the month's end.
 */
export function mcs150Due(
  usdot: string,
  today = new Date(),
): { month: number; year: number } | null {
  const digits = usdot.replace(/\D/g, '')
  if (digits.length < 2) return null
  const last = Number(digits[digits.length - 1])
  const nextToLast = Number(digits[digits.length - 2])
  const month = last === 0 ? 9 : last - 1 // 0-based
  const wantOdd = nextToLast % 2 === 1
  let year = today.getFullYear()
  const passed = (y: number) =>
    y < today.getFullYear() || (y === today.getFullYear() && month < today.getMonth())
  while ((year % 2 === 1) !== wantOdd || passed(year)) year += 1
  return { month, year }
}

function Mcs150Tool() {
  const [usdot, setUsdot] = useState('')
  const shown = usdot || '1234567'
  const due = mcs150Due(shown)
  const digits = shown.replace(/\D/g, '')
  const lastDay = due ? new Date(due.year, due.month + 1, 0).getDate() : 0
  return (
    <ToolCard
      icon={CalendarClock}
      label="Free tool"
      title="When is your MCS-150 update due?"
      footer={
        <>
          Every carrier updates its MCS-150 every two years, even if nothing changed. Missing it can
          get your USDOT number deactivated.
        </>
      }
    >
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Your USDOT number</span>
        <input
          inputMode="numeric"
          placeholder="e.g. 1234567"
          value={usdot}
          maxLength={8}
          onChange={(e) => setUsdot(e.target.value.replace(/\D/g, ''))}
          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-canvas px-4 py-3 font-mono text-lg tracking-widest text-slate-900 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
        />
      </label>
      <div className="mt-4">
        <Result id={shown}>
          {due ? (
            <div className="rounded-2xl bg-[#101853] p-4 text-white">
              <div className="text-xs text-white/70">
                {usdot ? 'Your next update is due by' : 'Example: USDOT 1234567 is due by'}
              </div>
              <div className="mt-1 text-2xl font-semibold [font-family:var(--font-display)]">
                {MONTHS[due.month]} {lastDay}, {due.year}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  Last digit <b className="font-mono text-amber-300">{digits[digits.length - 1]}</b>{' '}
                  → {MONTHS[due.month]}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  Next-to-last{' '}
                  <b className="font-mono text-amber-300">{digits[digits.length - 2]}</b> →{' '}
                  {due.year % 2 ? 'odd' : 'even'} years
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
              Enter at least two digits of your USDOT number.
            </p>
          )}
        </Result>
      </div>
    </ToolCard>
  )
}

// --- Brokers: quick booking check ---------------------------------------------------------------

type Level = 'stop' | 'major' | 'minor'
const QUESTIONS: { key: string; ask: string; flagWhen: boolean; level: Level }[] = [
  { key: 'authority', ask: 'Operating authority is active', flagWhen: false, level: 'stop' },
  {
    key: 'liability',
    ask: 'Liability on file meets the legal minimum',
    flagWhen: false,
    level: 'stop',
  },
  { key: 'oos', ask: 'Has an active out-of-service order', flagWhen: true, level: 'stop' },
  {
    key: 'shared',
    ask: 'Shares a phone, email or address with other carriers',
    flagWhen: true,
    level: 'major',
  },
  { key: 'new', ask: 'Authority is under 6 months old', flagWhen: true, level: 'minor' },
  {
    key: 'renewal',
    ask: 'Insurance renewal is due within 30 days',
    flagWhen: true,
    level: 'minor',
  },
]
const START: Record<string, boolean> = {
  authority: true,
  liability: true,
  oos: false,
  shared: false,
  new: false,
  renewal: false,
}
/** As in vetting.ts: any stop → do not book; a major item or 3+ minor ones → high risk. */
const VERDICTS = {
  do_not_book: { label: 'Do not book', style: 'bg-red-600 text-white', icon: CircleX },
  high_risk: { label: 'High risk', style: 'bg-red-100 text-red-800', icon: TriangleAlert },
  review: { label: 'Book with review', style: 'bg-amber-100 text-amber-800', icon: TriangleAlert },
  ready: { label: 'Ready to book', style: 'bg-emerald-100 text-emerald-800', icon: CircleCheck },
} as const

function BookingCheckTool() {
  const [answers, setAnswers] = useState(START)
  const flagged = QUESTIONS.filter((q) => answers[q.key] === q.flagWhen)
  const count = (level: Level) => flagged.filter((q) => q.level === level).length
  const verdict = count('stop')
    ? 'do_not_book'
    : count('major') || count('minor') >= 3
      ? 'high_risk'
      : count('minor')
        ? 'review'
        : 'ready'
  const { label, style, icon: VerdictIcon } = VERDICTS[verdict]
  return (
    <ToolCard
      icon={ShieldCheck}
      label="Try it"
      title="Quick booking check"
      footer={
        <>
          A short version of the booking check in the broker portal, which reads the carrier’s
          record for you. It isn’t a safety rating or a guarantee.
        </>
      }
    >
      <ul className="space-y-1.5">
        {QUESTIONS.map((q) => {
          const on = answers[q.key]
          const bad = on === q.flagWhen
          return (
            <li key={q.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: !a[q.key] }))}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50"
              >
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[#101853]' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-[1.125rem]' : 'left-0.5'}`}
                  />
                </span>
                <span className="flex-1">{q.ask}</span>
                {bad && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${q.level === 'stop' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}
                  >
                    {q.level}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-3">
        <Result id={verdict}>
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${style}`}>
            <VerdictIcon className="size-6 shrink-0" aria-hidden />
            <div>
              <div className="text-lg font-semibold">{label}</div>
              <div className="text-xs opacity-80">
                {flagged.length === 0
                  ? 'Nothing here holds the booking back.'
                  : `${flagged.length} item${flagged.length > 1 ? 's' : ''} to weigh.`}
              </div>
            </div>
          </div>
        </Result>
      </div>
    </ToolCard>
  )
}

// --- Insurance agents: federal liability minimums -----------------------------------------------

/** 49 CFR 387.9 (for-hire carriers of property, 10,001 lbs or more) and 387.33 (passengers). */
const MINIMUMS = [
  {
    key: 'general',
    label: 'General freight',
    amount: 750_000,
    detail: 'Non-hazardous property, vehicles of 10,001 lbs or more',
  },
  {
    key: 'hazmat',
    label: 'Oil & hazmat',
    amount: 1_000_000,
    detail: 'Oil, hazardous waste and other listed hazardous materials',
  },
  {
    key: 'bulk',
    label: 'Bulk hazmat & explosives',
    amount: 5_000_000,
    detail: 'Certain hazardous substances in bulk, and certain explosives and radioactive loads',
  },
  {
    key: 'bus-small',
    label: 'Passengers, 15 or fewer',
    amount: 1_500_000,
    detail: 'Seating for 15 or fewer passengers, including the driver',
  },
  {
    key: 'bus',
    label: 'Passengers, 16 or more',
    amount: 5_000_000,
    detail: 'Seating for 16 or more passengers, including the driver',
  },
] as const

function MinimumTool() {
  const [key, setKey] = useState<(typeof MINIMUMS)[number]['key']>('general')
  const pick = MINIMUMS.find((m) => m.key === key) ?? MINIMUMS[0]
  return (
    <ToolCard
      icon={ShieldHalf}
      label="Quick reference"
      title="What liability minimum applies?"
      footer={
        <>
          Federal minimums for for-hire carriers in interstate commerce (49 CFR 387). Many shippers
          and brokers ask for more, often $1,000,000.
        </>
      }
    >
      <div role="radiogroup" aria-label="Kind of carrier" className="flex flex-wrap gap-2">
        {MINIMUMS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={m.key === key}
            onClick={() => setKey(m.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              m.key === key
                ? 'bg-[#101853] text-white ring-[#101853]'
                : 'text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Result id={pick.key}>
          <div className="rounded-2xl bg-[#101853] p-4 text-white">
            <div className="text-xs text-white/70">Minimum liability (BI&PD)</div>
            <div className="mt-1 text-4xl font-semibold tabular-nums [font-family:var(--font-display)]">
              ${pick.amount.toLocaleString('en-US')}
            </div>
            <div className="mt-2 text-xs text-white/80">{pick.detail}</div>
          </div>
        </Result>
      </div>
    </ToolCard>
  )
}
