import { ArrowRight, FileSearch, FileText, Truck, Users } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import type { CarrierProfile } from '../../../types/carrierProfile'
import { formatDateTime, formatDocket } from '../../../utils/format'
import { hazmatLabel, operatingArea } from '../../../utils/operation'
import { greeting } from '../greeting'
import { PortalHeroBackdrop } from '../PortalHeroBackdrop'
import { ease } from './ui'

/**
 * Top of the carrier's home: the company itself, like the lettering on a truck door. Name, DBA,
 * USDOT and MC numbers, registration and authority status and the fleet size from the census,
 * with the three places a carrier goes most: its page, its Safety Score Report and DataQs.
 */
export function CompanyPlate({
  carrier,
  firstName,
  page,
  openCases,
}: {
  carrier: CarrierProfile
  firstName: string | undefined
  page: string
  /** This carrier's open DataQs requests */
  openCases: number
}) {
  const reduce = useReducedMotion()
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: 0.1 + i * 0.08, ease },
        }

  const dockets = carrier.authority.dockets.filter((d) => d.prefix && d.number)
  const facts = [
    { label: 'USDOT', value: String(carrier.usdot_number) },
    ...dockets
      .slice(0, 2)
      .map((d) => ({ label: 'Docket', value: formatDocket(d.prefix, d.number) })),
    { label: 'Registration', value: carrier.registration_status ?? '—' },
    { label: 'Authority', value: carrier.authority.status ?? 'None on file' },
    // From the carrier's MCS-150 (census), so it can see what brokers see.
    ...(operatingArea(carrier.operation)
      ? [{ label: 'Operation', value: operatingArea(carrier.operation) ?? '' }]
      : []),
    ...(hazmatLabel(carrier.operation)
      ? [{ label: 'Hazmat', value: carrier.operation?.hazmat ? 'Yes' : 'No' }]
      : []),
  ]

  return (
    <section className="portal-hero relative isolate overflow-hidden rounded-3xl border border-white/15 shadow-xl">
      <PortalHeroBackdrop tone="carrier" />
      <div className="relative p-5 pb-9 sm:p-6 sm:pb-10 md:p-8 md:pb-12">
        <motion.p {...rise(0)} className="text-sm text-white/85">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}. Here’s your company as brokers find it.
        </motion.p>

        <motion.h1
          {...rise(1)}
          className="mt-2 text-3xl font-semibold tracking-tight text-white [overflow-wrap:anywhere] md:text-5xl"
        >
          {carrier.legal_name}
        </motion.h1>
        {carrier.dba_name && (
          <motion.p {...rise(1)} className="mt-1 text-sm text-white/80">
            Doing business as {carrier.dba_name}
          </motion.p>
        )}

        <motion.dl {...rise(2)} className="mt-5 flex flex-wrap gap-2">
          {facts.map((f, i) => (
            <div
              key={`${f.label}-${i}`}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2 backdrop-blur"
            >
              <dt className="font-label text-[10px] uppercase tracking-[0.14em] text-white/70">
                {f.label}
              </dt>
              <dd className="font-mono text-sm font-semibold text-white">{f.value}</dd>
            </div>
          ))}
          {carrier.equipment.power_units !== null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-3 py-2 backdrop-blur">
              <Truck className="size-4 text-[var(--hero-highlight)]" aria-hidden />
              <span className="text-sm text-white">
                <span className="font-semibold tabular-nums">{carrier.equipment.power_units}</span>{' '}
                power units
              </span>
            </div>
          )}
          {carrier.driver_count !== null && (
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-3 py-2 backdrop-blur">
              <Users className="size-4 text-[var(--hero-highlight)]" aria-hidden />
              <span className="text-sm text-white">
                <span className="font-semibold tabular-nums">{carrier.driver_count}</span> drivers
              </span>
            </div>
          )}
        </motion.dl>

        <motion.div {...rise(3)} className="mt-6 flex flex-wrap gap-2">
          <Link
            to={page}
            className="group inline-flex items-center gap-2 rounded-xl bg-[var(--hero-cta)] px-5 py-3 text-sm font-medium text-[var(--hero-cta-ink)] shadow-lg transition-all hover:bg-cta-hover"
          >
            Open carrier page
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
          <Link
            to={`${page}?tab=safety-score-report`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <FileText className="size-4" aria-hidden />
            Safety Score Report
          </Link>
          <Link
            to="/portal/dataqs"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <FileSearch className="size-4" aria-hidden />
            DataQs{openCases > 0 ? ` · ${openCases} open` : ''}
          </Link>
        </motion.div>

        {carrier.last_refreshed_at && (
          <p className="mt-4 text-xs text-white/70">
            FMCSA data refreshed {formatDateTime(carrier.last_refreshed_at)}
          </p>
        )}
      </div>
    </section>
  )
}
