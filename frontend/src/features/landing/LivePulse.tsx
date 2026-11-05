import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { getPublicStateCounts, getRecentCarriers } from '../../api/directory'
import { CountUp } from './CountUp'
import { Accent, reveal, SectionHeading } from './landingParts'

/*
 * "Right now": live numbers that count up when scrolled into view (active interstate carriers,
 * new in the last 30 days, inactive USDOT numbers, states), and a strip of the carriers that just
 * registered, moving sideways. All real and refreshed daily (the map's data, routes/directory.py).
 * No wording about where the data comes from (the public pages' rule).
 */

const shortDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** The live numbers and the carriers that just registered (shared by the section and the strip). */
function usePulse({ withInactive = true }: { withInactive?: boolean } = {}) {
  const active = useQuery({
    queryKey: ['public-directory', 'states', 'active'],
    queryFn: () => getPublicStateCounts('active'),
  })
  const inactive = useQuery({
    queryKey: ['public-directory', 'states', 'inactive'],
    queryFn: () => getPublicStateCounts('inactive'),
    enabled: withInactive,
  })
  const recent = useQuery({ queryKey: ['public-directory', 'recent'], queryFn: getRecentCarriers })

  const sum = (rows: { carriers: number }[] | undefined) =>
    rows ? rows.reduce((total, s) => total + s.carriers, 0) : null
  return {
    activeCarriers: sum(active.data),
    newest: active.data ? active.data.reduce((t, s) => t + s.new_last_30_days, 0) : null,
    inactiveCarriers: sum(inactive.data),
    states: active.data ? active.data.length : null,
    items: recent.data ?? [],
  }
}

type Recent = ReturnType<typeof usePulse>['items']

/** One run of just-registered carriers; the copy (hidden) makes the strip loop seamlessly. */
function RecentRow({ list, hidden }: { list: Recent; hidden: boolean }) {
  return (
    <ul
      className="marquee-row flex shrink-0 items-center gap-8 pr-8"
      aria-hidden={hidden || undefined}
    >
      {list.map((c) => (
        <li
          key={`${hidden}-${c.usdot_number}`}
          className="flex items-center gap-2 whitespace-nowrap text-sm"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <Link
            to={`/try?q=${c.usdot_number}`}
            tabIndex={hidden ? -1 : undefined}
            className="font-medium text-white hover:text-amber-300"
          >
            {c.legal_name}
          </Link>
          <span className="text-white/65">
            {[c.city, c.state].filter(Boolean).join(', ')}
            {c.registered_on && ` · ${shortDay.format(new Date(`${c.registered_on}T00:00:00Z`))}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The home page's short version, one slim line under the free search so it shows on the first
 * screen: two live numbers that count up, then the carriers that just registered scrolling past.
 * "Active carriers" are interstate carriers with an active USDOT number (the map's count); the
 * hover title says so. Nothing shows until the numbers have loaded.
 */
export function LiveStrip() {
  const { activeCarriers, newest, items } = usePulse({ withInactive: false })
  if (activeCarriers == null) return null
  return (
    <motion.section
      {...reveal(0.1)}
      aria-label="Right now"
      className="mx-auto mt-6 flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-white/8 text-white ring-1 ring-white/15 backdrop-blur lg:flex-row lg:items-center"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2.5">
        <span className="font-label flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-300 opacity-70 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-300" />
          </span>
          Right now
        </span>
        <span
          className="flex items-baseline gap-1.5"
          title="Interstate carriers (hauling across state lines) with an active USDOT number"
        >
          <span className="text-lg font-semibold [font-family:var(--font-display)]">
            <CountUp value={activeCarriers} />
          </span>
          <span className="text-xs text-white/75">active carriers</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold [font-family:var(--font-display)]">
            <CountUp value={newest} prefix="+" />
          </span>
          <span className="text-xs text-white/75">new in 30 days</span>
        </span>
      </div>
      {items.length > 0 && (
        <div
          aria-label="Carriers that just registered"
          role="region"
          className="marquee relative min-w-0 flex-1 overflow-hidden border-t border-white/10 bg-white/5 py-2.5 lg:border-l lg:border-t-0"
        >
          {/* Slower than the section's strips: about 3 seconds per carrier. */}
          <div
            className="marquee-track flex w-max"
            style={{ animationDuration: `${Math.max(90, items.length * 3)}s` }}
          >
            <RecentRow list={items} hidden={false} />
            <RecentRow list={items} hidden />
          </div>
        </div>
      )}
    </motion.section>
  )
}

export function LivePulse({ number }: { number?: string }) {
  const { activeCarriers, newest, inactiveCarriers, states, items } = usePulse()

  const stats = [
    { label: 'Active interstate carriers', value: activeCarriers, prefix: '' },
    { label: 'Registered in the last 30 days', value: newest, prefix: '+' },
    { label: 'Inactive USDOT numbers', value: inactiveCarriers, prefix: '' },
    { label: 'States on the map', value: states, prefix: '' },
  ]

  // Two strips with different carriers: the first half, then the rest (running the other way).
  const half = Math.ceil(items.length / 2)
  const strips = [items.slice(0, half), items.slice(half)].filter((s) => s.length > 0)

  return (
    <div>
      <SectionHeading
        number={number}
        eyebrow="Right now"
        title={
          <>
            The trucking record, <Accent>live</Accent>
          </>
        }
        aside="New carriers register every day and others go inactive. These numbers update daily."
      />
      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, prefix }, i) => (
          <motion.div
            key={label}
            {...reveal(i * 0.08)}
            className="rounded-2xl bg-white/8 px-5 py-5 ring-1 ring-white/15 backdrop-blur"
          >
            <div className="text-3xl font-semibold text-white md:text-4xl [font-family:var(--font-display)]">
              <CountUp value={value} prefix={prefix} />
            </div>
            <div className="mt-1 text-sm text-white/75">{label}</div>
          </motion.div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="mt-8">
          <div className="font-label mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
            Just registered
          </div>
          <div className="space-y-2.5">
            {strips.map((list, i) => (
              <section
                key={i}
                aria-label={
                  i === 0 ? 'Carriers that just registered' : 'More carriers that just registered'
                }
                className={`marquee relative overflow-hidden rounded-2xl bg-white/6 py-3.5 ring-1 ring-white/10 ${i === 1 ? 'marquee-reverse' : ''}`}
              >
                <div className="marquee-track flex w-max">
                  <RecentRow list={list} hidden={false} />
                  <RecentRow list={list} hidden />
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
