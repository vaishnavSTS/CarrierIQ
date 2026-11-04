import {
  AlertTriangle,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/StatusBadge'
import type { CarrierProfile } from '../../../types/carrierProfile'
import type { CarrierNetwork, CheckStatus } from '../../../types/network'
import { INSURANCE_LABEL, insuranceTone, statusTone } from '../../../utils/status'
import { CARD, LABEL, LINK, useRise } from './ui'

const CHECK_ICON: Record<CheckStatus, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-emerald-600' },
  attention: { icon: AlertTriangle, className: 'text-amber-600' },
  alert: { icon: CircleAlert, className: 'text-red-600' },
  info: { icon: Info, className: 'text-slate-500' },
  unknown: { icon: Minus, className: 'text-slate-400' },
}

/**
 * Authority, insurance and fleet size as FMCSA lists them, then the registration checks: a tally,
 * and the full list folded away (the action center already lists the ones that need a look).
 */
export function RegistrationCard({
  profile,
  network,
  to,
  index,
}: {
  profile: CarrierProfile
  network: CarrierNetwork | undefined
  to: string
  index: number
}) {
  const rise = useRise()
  const checks = network?.registration_checks ?? []
  const passed = checks.filter((c) => c.status === 'ok').length
  const flagged = checks.filter((c) => c.status === 'alert' || c.status === 'attention').length

  return (
    <motion.div {...rise(index)} className={`${CARD} flex flex-col`}>
      <div className={`${LABEL} text-slate-500`}>Authority & registration</div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <Row label="Operating authority">
          {profile.authority.status ? (
            <StatusBadge
              label={profile.authority.status}
              tone={statusTone(profile.authority.status)}
            />
          ) : (
            <span className="text-slate-500">No dockets</span>
          )}
        </Row>
        <Row label="Insurance">
          {profile.insurance.status ? (
            <StatusBadge
              label={INSURANCE_LABEL[profile.insurance.status] ?? profile.insurance.status}
              tone={insuranceTone(profile.insurance.status)}
            />
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </Row>
        <Row label="Power units">
          <span className="font-semibold tabular-nums text-slate-900">
            {profile.equipment.power_units ?? '—'}
          </span>
        </Row>
        <Row label="Drivers">
          <span className="font-semibold tabular-nums text-slate-900">
            {profile.driver_count ?? '—'}
          </span>
        </Row>
      </dl>

      {checks.length > 0 && (
        <details className="group mt-4 border-t border-slate-100 pt-3">
          <summary className="tap flex cursor-pointer list-none items-center gap-2 text-sm text-slate-700">
            <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-slate-900">
                {passed} of {checks.length}
              </span>{' '}
              registration checks clear
              {flagged > 0 && <span className="text-amber-700"> · {flagged} to look at</span>}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
              aria-hidden
            />
          </summary>
          <ul className="mt-3 space-y-2.5">
            {checks.map((c) => {
              const { icon: Icon, className } = CHECK_ICON[c.status]
              return (
                <li key={c.key} className="flex items-start gap-2.5 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.detail}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      <Link to={to} className={`${LINK} mt-auto inline-flex items-center gap-0.5 pt-4`}>
        Authority and insurance on file
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </motion.div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
