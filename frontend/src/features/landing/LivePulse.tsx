import { useQuery } from '@tanstack/react-query'
import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { getPublicStateCounts, getRecentCarriers } from '../../api/directory'
import { Accent, reveal, SectionHeading } from './landingParts'

/*
 * "Right now": live numbers that count up when scrolled into view (active interstate carriers,
 * new in the last 30 days, inactive USDOT numbers, states), and a strip of the carriers that just
 * registered, moving sideways. All real and refreshed daily (the map's data, routes/directory.py).
 * No wording about where the data comes from (the public pages' rule).
 */

const format = new Intl.NumberFormat('en-US')
const shortDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** A number that counts up from 0 the first time it is on screen. */
function CountUp({ value, prefix = '' }: { value: number | null; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (value == null || !inView) return
    if (reduceMotion) {
      setShown(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, inView, reduceMotion])

  return (
    <span ref={ref} className="tabular-nums">
      {value == null ? '…' : `${prefix}${format.format(shown)}`}
    </span>
  )
}

export function LivePulse({ number }: { number?: string }) {
  const active = useQuery({
    queryKey: ['public-directory', 'states', 'active'],
    queryFn: () => getPublicStateCounts('active'),
  })
  const inactive = useQuery({
    queryKey: ['public-directory', 'states', 'inactive'],
    queryFn: () => getPublicStateCounts('inactive'),
  })
  const recent = useQuery({ queryKey: ['public-directory', 'recent'], queryFn: getRecentCarriers })

  const sum = (rows: { carriers: number }[] | undefined) =>
    rows ? rows.reduce((total, s) => total + s.carriers, 0) : null
  const newest = active.data ? active.data.reduce((t, s) => t + s.new_last_30_days, 0) : null

  const stats = [
    { label: 'Active interstate carriers', value: sum(active.data), prefix: '' },
    { label: 'Registered in the last 30 days', value: newest, prefix: '+' },
    { label: 'Inactive USDOT numbers', value: sum(inactive.data), prefix: '' },
    { label: 'States on the map', value: active.data ? active.data.length : null, prefix: '' },
  ]

  const items = recent.data ?? []
  const row = (hidden: boolean) => (
    <ul
      className="marquee-row flex shrink-0 items-center gap-8 pr-8"
      aria-hidden={hidden || undefined}
    >
      {items.map((c) => (
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
          <section
            aria-label="Carriers that just registered"
            className="marquee relative overflow-hidden rounded-2xl bg-white/6 py-3.5 ring-1 ring-white/10"
          >
            <div className="marquee-track flex w-max">
              {row(false)}
              {row(true)}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
