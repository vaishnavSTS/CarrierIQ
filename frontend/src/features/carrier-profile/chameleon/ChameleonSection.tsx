import type { ReactNode } from 'react'

import { CarrierLink } from '../../../components/CarrierLink'
import { SourceTag } from '../../../components/SourceTag'
import { StatusBadge } from '../../../components/StatusBadge'
import { useChameleonCheck } from '../../../hooks/useChameleon'
import type { ChameleonCheck, ChameleonLinked, ChameleonShare } from '../../../types/chameleon'
import { formatDate, formatDateTime, formatPhone } from '../../../utils/format'
import { Empty, Field, Section } from '../Section'
import { cellClass, headClass, tableClass } from '../styles'

const SHARE_LABEL: Record<string, string> = {
  ein: 'Same EIN',
  duns: 'DUNS number',
  phone: 'Phone',
  email: 'Email',
  address: 'Address and unit',
  mailing_address: 'Mailing address',
  officer: 'Officer',
  building: 'Building (other unit)',
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}

function shownValue(share: ChameleonShare): string {
  if (!share.value) return '—'
  if (share.kind === 'phone') return formatPhone(share.value)
  return share.value
}

function year(value: string): string {
  return value.slice(0, 4)
}

/**
 * One factual line about the strongest link, e.g. "Shares 3 kinds of detail with 1 carrier that
 * had a revocation or out-of-service order (2025) · this USDOT number was added 45 days later".
 */
function headline(check: ChameleonCheck): string {
  const { summary, linked } = check
  if (summary.linked_carriers === 0) {
    return 'No other USDOT number shares this carrier’s identity details or trucks in the records checked.'
  }
  const top = linked[0]
  const parts = [
    `${plural(summary.linked_carriers, 'other USDOT number')} share${summary.linked_carriers === 1 ? 's' : ''} details or trucks with this carrier`,
  ]
  if (summary.shut_down > 0) {
    parts.push(
      `${plural(summary.shut_down, 'of them', 'of them')} had a revocation or out-of-service order`,
    )
  }
  if (top.shutdown_date && top.distinct_kinds >= 2) {
    const after =
      top.days_after_shutdown !== null && top.days_after_shutdown >= 0
        ? ` · this USDOT number was added ${plural(top.days_after_shutdown, 'day')} after that`
        : ''
    parts.push(
      `the strongest link shares ${plural(top.distinct_kinds, 'kind')} of detail with USDOT ${top.usdot_number} (shut down ${year(top.shutdown_date)})${after}`,
    )
  }
  return `${parts.join('; ')}.`
}

function SubHeading({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-2 mt-8 first:mt-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{children}</h3>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

function Shutdown({ c }: { c: ChameleonLinked }) {
  if (!c.revocations.length && !c.oos_orders.length)
    return <span className="text-slate-400">None found</span>
  return (
    <ul className="space-y-0.5 text-xs">
      {c.revocations.length > 0 && (
        <li>Revocation / suspension: {c.revocations.map((d) => formatDate(d)).join(', ')}</li>
      )}
      {c.oos_orders.length > 0 && (
        <li>
          Out-of-service order: {c.oos_orders.map((d) => formatDate(d)).join(', ')}
          {c.active_oos_order && (
            <span className="ml-1">
              <StatusBadge label="active" tone="down" />
            </span>
          )}
        </li>
      )}
    </ul>
  )
}

function LinkedTable({ carriers }: { carriers: ChameleonLinked[] }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead className={headClass}>
          <tr>
            <th className={cellClass}>Carrier</th>
            <th className={cellClass}>Shared details</th>
            <th className={cellClass}>Shared VINs</th>
            <th className={cellClass}>Census status</th>
            <th className={cellClass}>Revocations and out-of-service orders</th>
            <th className={cellClass}>This carrier added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {carriers.map((c) => (
            <tr key={c.usdot_number} className="align-top">
              <td className={cellClass}>
                <CarrierLink usdotNumber={c.usdot_number} />
                <div className="text-xs text-slate-500">{c.legal_name ?? 'Not in the census'}</div>
                {c.registered && (
                  <div className="text-[11px] text-slate-500">
                    USDOT added {formatDate(c.registered)}
                  </div>
                )}
              </td>
              <td className={cellClass}>
                {c.shares.length === 0 ? (
                  <span className="text-xs text-slate-400">Trucks only</span>
                ) : (
                  <ul className="flex max-w-xs flex-wrap gap-1">
                    {c.shares.map((s) => (
                      <li
                        key={`${s.kind}-${s.past}`}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800"
                        title={
                          s.kind === 'ein' ? 'Same EIN (tax ID) on FMCSA QCMobile' : shownValue(s)
                        }
                      >
                        {SHARE_LABEL[s.kind] ?? s.kind}
                        {s.past && <span className="text-slate-500"> (past)</span>}
                        {s.kind !== 'ein' && (
                          <>
                            : <span className="text-slate-600">{shownValue(s)}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {c.first_linked && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    First matched by CarrierSafetyScan {formatDate(c.first_linked)}
                  </div>
                )}
              </td>
              <td className={`${cellClass} tabular-nums`}>{c.shared_vins || '—'}</td>
              <td className={cellClass}>
                {c.status ? (
                  <StatusBadge
                    label={c.status === 'ACTIVE' ? 'Active' : 'Not active'}
                    tone={c.status === 'ACTIVE' ? 'ok' : 'neutral'}
                  />
                ) : (
                  '—'
                )}
              </td>
              <td className={cellClass}>
                <Shutdown c={c} />
              </td>
              <td className={`${cellClass} whitespace-nowrap text-xs`}>
                {c.days_after_shutdown === null
                  ? '—'
                  : c.days_after_shutdown >= 0
                    ? `${plural(c.days_after_shutdown, 'day')} after`
                    : `${plural(-c.days_after_shutdown, 'day')} before`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Chameleon check (staff and broker portals): other USDOT numbers sharing this carrier's
 * identity details or trucks, what happened to them, and how long after that this carrier was
 * added. It reports what FMCSA's records show; it is never a verdict.
 */
export function ChameleonSection({ usdotNumber }: { usdotNumber: number }) {
  const { data, isPending, error } = useChameleonCheck(usdotNumber)

  return (
    <Section
      id="chameleon"
      title="Chameleon check"
      source="FMCSA Company Census, Out of Service Orders, Motus RevokeSuspend and inspections"
    >
      {isPending ? (
        <Empty>Comparing this carrier’s details with every carrier in FMCSA’s census…</Empty>
      ) : error ? (
        <p className="text-sm text-red-700">Could not run the check: {error.message}</p>
      ) : (
        <Check check={data} />
      )}
    </Section>
  )
}

function Check({ check }: { check: ChameleonCheck }) {
  const { fleet_overlap: fleet, prior_revoke: prior } = check
  return (
    <div>
      <p className="text-sm font-medium text-slate-900">{headline(check)}</p>
      <p className="mt-1 text-xs text-slate-500">
        A chameleon carrier is an operation that re-registers under a new name and USDOT number to
        leave a revocation or out-of-service order behind, usually keeping its people, phone,
        address, business record or trucks.
        {check.links_checked_at &&
          ` Shared details last checked ${formatDateTime(check.links_checked_at)}.`}
      </p>
      {check.note && <p className="mt-2 text-xs text-amber-700">{check.note}</p>}

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="FMCSA prior-revocation link">
          {prior.usdot_number ? (
            <>
              Linked to revoked <CarrierLink usdotNumber={prior.usdot_number} />
            </>
          ) : prior.flagged ? (
            'This USDOT number itself had a revocation'
          ) : (
            'None'
          )}
          <span className="block text-xs text-slate-500">FMCSA census prior_revoke flag</span>
        </Field>
        <Field label={`Fleet overlap · last ${fleet.window_months} months`}>
          {fleet.percent === null ? (
            'No power units seen on inspections'
          ) : (
            <>
              {fleet.percent}%{' '}
              <span className="text-slate-500">
                ({fleet.shared_power_units} of {plural(fleet.power_units_seen, 'power unit')})
              </span>
            </>
          )}
          <span className="block text-xs text-slate-500">
            Power units also inspected under another USDOT number.{' '}
            {fleet.over_threshold
              ? `At or above the ${fleet.threshold_percent}% level some vetting tools flag.`
              : `Some vetting tools flag ${fleet.threshold_percent}% or more.`}
          </span>
        </Field>
        <Field label="EIN (tax ID) check">
          {check.ein_known
            ? `Compared with ${plural(check.eins_compared ?? 0, 'linked carrier')}`
            : 'Not available from FMCSA'}
          <span className="block text-xs text-slate-500">
            FMCSA QCMobile · the number itself is not shown
          </span>
        </Field>
        <Field label="This USDOT number added">
          {formatDate(check.registered)}
          <span className="block text-xs text-slate-500">FMCSA census add date</span>
        </Field>
      </dl>

      <SubHeading
        note={
          check.summary.linked_carriers === 0
            ? undefined
            : 'Strongest first: carriers with a revocation or out-of-service order that share two or more kinds of detail, then by the number of kinds shared and shared VINs.'
        }
      >
        Linked USDOT numbers
      </SubHeading>
      {check.linked.length === 0 ? (
        <Empty>
          None found: no other carrier in FMCSA’s census shares this carrier’s DUNS number, phones,
          email, addresses or officers, and no truck was inspected under two or more other USDOT
          numbers.
        </Empty>
      ) : (
        <LinkedTable carriers={check.linked} />
      )}
      {check.truncated && (
        <p className="mt-2 text-xs text-slate-500">
          Showing the {check.linked.length} strongest links; more carriers share weaker details.
        </p>
      )}

      <SubHeading>Innocent explanations</SubHeading>
      <p className="text-sm text-slate-700">
        Shared details are common for fleets under the same owner, family businesses, carriers using
        the same registered agent or office suite, and dispatch or compliance services that list
        their own phone or email. Trucks move between carriers when they are leased, rented or sold.
        A link is a question to ask the carrier, not a finding.
      </p>

      <SubHeading>How the check works</SubHeading>
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>
          This carrier’s DUNS number, phones (office, cell, fax), email, physical and mailing
          addresses and officer names are compared with every carrier in FMCSA’s Company Census,
          including phones and addresses it used before (marked “past”).
        </li>
        <li>
          Revocation / suspension orders (FMCSA Motus) and out-of-service orders are looked up for
          each linked USDOT number, and compared with the date this USDOT number was added.
        </li>
        <li>
          Trucks: VINs seen on this carrier’s inspections that were also inspected under another
          USDOT number. Carriers linked by trucks alone are listed from two shared VINs.
        </li>
        <li>
          EIN (tax ID): from FMCSA’s QCMobile API. FMCSA offers no search by EIN, so it is compared
          only with the linked USDOT numbers above (up to 25, strongest first); a match is shown as
          “Same EIN”.
        </li>
        <li>Not included: links FMCSA’s public data does not show.</li>
      </ul>
      <div className="mt-3">
        <SourceTag>CarrierSafetyScan checks of public FMCSA records</SourceTag>
      </div>
    </div>
  )
}
