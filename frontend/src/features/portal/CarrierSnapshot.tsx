import { AlertTriangle, ArrowRight, CircleAlert, CircleCheck, Info, Minus } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../components/StatusBadge'
import { useCarrierProfile } from '../../hooks/useCarrierProfile'
import { useCarrierSafety } from '../../hooks/useCarrierSafety'
import { useCarrierNetwork } from '../../hooks/useNetwork'
import type { CheckStatus } from '../../types/network'
import { formatPercent } from '../../utils/format'
import { brokerFlags } from '../carrier-profile/network/brokerFlags'
import { ISS_BAND } from '../carrier-profile/safety/issBand'

const ease = [0.16, 1, 0.3, 1] as const

const CHECK_ICON: Record<CheckStatus, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-emerald-600' },
  attention: { icon: AlertTriangle, className: 'text-amber-600' },
  alert: { icon: CircleAlert, className: 'text-red-600' },
  info: { icon: Info, className: 'text-slate-500' },
  unknown: { icon: Minus, className: 'text-slate-400' },
}

/**
 * Client home: their own carrier's standing right now, from the same records brokers check.
 * The Estimated ISS, what a broker's check would flag, the registration checks one by one, and
 * out-of-service rates against the national average, each linking to the tab with the detail.
 */
export function CarrierSnapshot({ usdotNumber }: { usdotNumber: number }) {
  const profile = useCarrierProfile(usdotNumber)
  const network = useCarrierNetwork(usdotNumber)
  const safety = useCarrierSafety(usdotNumber)
  const reduce = useReducedMotion()
  const page = `/portal/carriers/${usdotNumber}`

  if (profile.isPending) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 text-sm text-slate-500">
        Loading your carrier’s FMCSA record…
      </section>
    )
  }
  if (!profile.data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 text-sm text-red-700">
        Couldn’t load your carrier’s record. Try again shortly.
      </section>
    )
  }

  const carrier = profile.data
  const iss = safety.data?.estimated_iss ?? null
  const band = iss?.band ? ISS_BAND[iss.band] : null
  const flags = network.data
    ? brokerFlags(network.data, carrier).filter((f) => f.level !== 'info')
    : null
  const recent = carrier.safety.recent
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay: 0.1 + i * 0.08, ease },
        }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Your carrier right now
          </h2>
          <p className="text-sm text-slate-600">
            {carrier.legal_name} · USDOT <span className="font-mono">{carrier.usdot_number}</span> ·
            the same FMCSA records brokers check
          </p>
        </div>
        <Link
          to={page}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline"
        >
          Open full profile
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Estimated ISS */}
        <motion.div
          {...rise(0)}
          className="flex flex-col rounded-2xl border border-slate-200 bg-surface p-5"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Estimated ISS – Safety score
          </div>
          {safety.isPending ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : iss?.value != null && band ? (
            <>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-semibold tabular-nums text-slate-950">
                  {iss.value}
                </span>
                <StatusBadge label={band.status} tone={band.tone} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{band.range} of 1–100 · lower is better</p>
              <p className="mt-3 text-sm text-slate-700">{iss.reason}.</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Not enough inspection data for an estimate yet.
            </p>
          )}
          <Link
            to={`${page}?tab=safety`}
            className="mt-auto pt-4 text-sm font-medium text-accent-strong hover:underline"
          >
            What drives it and how to improve ›
          </Link>
        </motion.div>

        {/* What a broker's check would flag */}
        <motion.div
          {...rise(1)}
          className="flex flex-col rounded-2xl border border-slate-200 bg-surface p-5"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            What a broker’s check would flag
          </div>
          {flags === null ? (
            <p className="mt-3 text-sm text-slate-500">Checking FMCSA records…</p>
          ) : flags.length === 0 ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-800">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              Nothing in your FMCSA records that brokers usually flag.
            </p>
          ) : (
            <>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {flags.length} item{flags.length === 1 ? '' : 's'} to look at
              </p>
              <ul className="mt-2 space-y-1.5">
                {flags.slice(0, 3).map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-sm text-slate-800">
                    {f.level === 'alert' ? (
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-amber-600"
                        aria-hidden
                      />
                    )}
                    {f.title}
                  </li>
                ))}
              </ul>
              {flags.length > 3 && (
                <p className="mt-1 text-xs text-slate-500">and {flags.length - 3} more</p>
              )}
            </>
          )}
          <Link
            to={`${page}?tab=network`}
            className="mt-auto pt-4 text-sm font-medium text-accent-strong hover:underline"
          >
            How each is usually fixed ›
          </Link>
        </motion.div>

        {/* Out-of-service rates */}
        <motion.div
          {...rise(2)}
          className="flex flex-col rounded-2xl border border-slate-200 bg-surface p-5"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Out-of-service rates · last {recent?.months ?? 24} months
          </div>
          {recent ? (
            <dl className="mt-3 space-y-3">
              {(
                [
                  ['Vehicle', recent.vehicle_oos_rate, recent.national_vehicle_oos_rate],
                  ['Driver', recent.driver_oos_rate, recent.national_driver_oos_rate],
                ] as const
              ).map(([label, rate, national]) => {
                const above = rate !== null && rate > national
                return (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm text-slate-700">{label}</dt>
                    <dd className="text-right">
                      <span
                        className={`text-xl font-semibold tabular-nums ${above ? 'text-amber-600' : 'text-slate-950'}`}
                      >
                        {formatPercent(rate)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        national average {formatPercent(national)}
                      </span>
                    </dd>
                  </div>
                )
              })}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No roadside inspections recently.</p>
          )}
          <Link
            to={`${page}?tab=safety`}
            className="mt-auto pt-4 text-sm font-medium text-accent-strong hover:underline"
          >
            Inspections and violations ›
          </Link>
        </motion.div>
      </div>

      {/* Registration checks, one row each */}
      {network.data && network.data.registration_checks.length > 0 && (
        <motion.div {...rise(3)} className="rounded-2xl border border-slate-200 bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Registration checks
            </div>
            <Link
              to={`${page}?tab=network`}
              className="text-sm font-medium text-accent-strong hover:underline"
            >
              Details ›
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
            {network.data.registration_checks.map((c, i) => {
              const { icon: Icon, className } = CHECK_ICON[c.status]
              return (
                <motion.li
                  key={c.key}
                  initial={reduce ? false : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 + i * 0.07, ease }}
                  className="flex items-start gap-2.5 text-sm"
                  title={c.detail}
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{c.label}</span>
                    <span className="block text-xs text-slate-500 md:truncate">{c.detail}</span>
                  </span>
                </motion.li>
              )
            })}
          </ul>
        </motion.div>
      )}
    </section>
  )
}
