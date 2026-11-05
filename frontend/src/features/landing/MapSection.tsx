import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarPlus,
  MapPinned,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import {
  getPublicStateCarriers,
  getPublicStateCounts,
  type DirectorySort,
  type StateCount,
} from '../../api/directory'
import { formatDate } from '../../utils/format'
import { number, UsMap } from '../directory/UsMap'
import { reveal, SectionHeading } from './landingParts'

/*
 * The carrier map on the public audience pages, open to everyone (no login). Every state shaded by
 * its active interstate carriers; click one for its newest, largest or A–Z carriers, 25 a page for
 * the first 3 pages (the backend's limit). Each carrier opens the free search. No wording here
 * about where the data comes from (the public pages' rule).
 */

const SORTS: { key: DirectorySort; label: string; icon: LucideIcon; note: string }[] = [
  { key: 'newest', label: 'Newest', icon: CalendarPlus, note: 'Newest USDOT registrations first.' },
  {
    key: 'largest',
    label: 'Largest',
    icon: Truck,
    note: 'By the fleet each carrier reported. A new USDOT reporting a very large fleet is marked: check it before relying on the number.',
  },
  { key: 'az', label: 'A–Z', icon: Building2, note: 'By company name.' },
]
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function MapSection({
  number: sectionNumber,
  title,
  aside,
  signUp,
}: {
  number?: string
  title: ReactNode
  aside: string
  /** Shown to visitors who aren't logged in */
  signUp?: { to: string; label: string }
}) {
  const counts = useQuery({
    queryKey: ['public-directory', 'states'],
    queryFn: getPublicStateCounts,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const total = (counts.data ?? []).reduce((sum, s) => sum + s.carriers, 0)
  const recent = (counts.data ?? []).reduce((sum, s) => sum + s.new_last_30_days, 0)
  const current = (counts.data ?? []).find((s) => s.state === selected) ?? null

  return (
    <div>
      <SectionHeading number={sectionNumber} eyebrow="Carrier map" title={title} aside={aside} />

      <motion.div {...reveal()} className="mt-10 grid items-start gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-surface p-4 shadow-xl shadow-brand-glow/10 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <Pill
              label="Active interstate carriers"
              value={counts.data ? number.format(total) : '…'}
            />
            <Pill
              label="Registered in the last 30 days"
              value={counts.data ? `+${number.format(recent)}` : '…'}
            />
          </div>
          {counts.isError ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The map couldn’t load just now. Try again in a moment.
            </p>
          ) : (
            <UsMap counts={counts.data} selected={selected} onSelect={setSelected} />
          )}
        </div>

        {current ? (
          <StateList key={current.state} state={current} signUp={signUp} />
        ) : (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-surface/80 p-8 text-center">
            <div>
              <MapPinned className="mx-auto size-9 text-accent-strong" aria-hidden />
              <p className="mt-3 font-semibold text-slate-900">Pick a state</p>
              <p className="mt-1 text-sm text-slate-600">
                Click any state to see its newest, largest and A–Z carriers.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2 ring-1 ring-slate-200">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  )
}

function StateList({
  state,
  signUp,
}: {
  state: StateCount
  signUp?: { to: string; label: string }
}) {
  const [sort, setSort] = useState<DirectorySort>('newest')
  const [letter, setLetter] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const list = useQuery({
    queryKey: ['public-directory', state.state, sort, letter, page],
    queryFn: () => getPublicStateCarriers(state.state, sort, letter, page),
  })
  const note = SORTS.find((s) => s.key === sort)?.note

  const choose = (next: DirectorySort) => {
    setSort(next)
    setPage(0)
  }
  const pickLetter = (next: string | null) => {
    setLetter(next)
    setPage(0)
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-surface shadow-xl shadow-brand-glow/10">
      <div className="bg-[#101853] px-5 py-4 text-white">
        <div className="text-xl font-semibold">{state.name}</div>
        <div className="mt-1 text-sm text-white/85">
          {number.format(state.carriers)} active interstate carriers ·{' '}
          <span className="text-amber-300">
            +{number.format(state.new_last_30_days)} in the last 30 days
          </span>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-slate-100 px-4 pt-3">
        {SORTS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sort === key}
            onClick={() => choose(key)}
            className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${
              sort === key
                ? 'bg-accent-soft text-accent-strong'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {sort === 'az' && (
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => pickLetter(null)}
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${letter === null ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            All
          </button>
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pickLetter(l)}
              className={`w-6 rounded py-0.5 text-xs font-semibold ${letter === l ? 'bg-[#101853] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <p className="px-4 pt-3 text-xs text-slate-500">{note}</p>

      <ul className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
        {list.isPending &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            </li>
          ))}
        {list.isError && (
          <li className="px-4 py-6 text-sm text-amber-900">
            This list couldn’t load just now. Try again in a moment.
          </li>
        )}
        {list.data?.carriers.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-600">No carriers here.</li>
        )}
        {list.data?.carriers.map((c) => (
          <li key={c.usdot_number} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                to={`/try?q=${c.usdot_number}`}
                title="Open it with your free search"
                className="font-medium text-slate-900 hover:text-accent-strong hover:underline"
              >
                {c.legal_name}
              </Link>
              <div className="mt-0.5 text-xs text-slate-500">
                <span className="font-mono">USDOT {c.usdot_number}</span>
                {c.city && ` · ${c.city}`}
              </div>
              {c.fleet_needs_check && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="size-3" aria-hidden />
                  New USDOT reporting a very large fleet
                </div>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-slate-600">
              <div className="font-semibold tabular-nums text-slate-900">
                {c.power_units != null
                  ? `${number.format(c.power_units)} ${c.power_units === 1 ? 'truck' : 'trucks'}`
                  : '—'}
              </div>
              <div>Since {formatDate(c.registered_on)}</div>
            </div>
          </li>
        ))}
      </ul>

      {list.data && (page > 0 || list.data.has_more) && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-slate-500">Page {page + 1}</span>
          <button
            type="button"
            disabled={!list.data.has_more}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {signUp && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-600">
            Click a carrier to open it with your free search.
          </span>
          <Link
            to={signUp.to}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#101853] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1e3a8a]"
          >
            {signUp.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  )
}
