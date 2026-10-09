import { Printer } from 'lucide-react'
import type { ReactNode } from 'react'

import { useCarrierAuthority } from '../../../hooks/useCarrierAuthority'
import { useCarrierEquipment } from '../../../hooks/useCarrierEquipment'
import { useCarrierNetwork } from '../../../hooks/useNetwork'
import type { CarrierProfile } from '../../../types/carrierProfile'
import { classificationLabel, classifications } from '../../../utils/classification'
import {
  formatDate,
  formatMoney,
  censusLabel,
  formatLocalDate,
  formatPercent,
  formatPhone,
  humanize,
  sourceLabel,
} from '../../../utils/format'
import { brokerFlags } from '../network/brokerFlags'
import { packetItems } from './packetItems'

const SIGNIFICANT_EVENTS = 5

function Block({
  title,
  source,
  children,
}: {
  title: string
  /** Where the section's figures come from */
  source?: string
  children: ReactNode
}) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-200 pb-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-strong">
          {title}
        </span>
        {source && <span className="text-[11px] font-normal text-slate-500">{source}</span>}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  source,
  children,
}: {
  label: string
  /** Where the value comes from */
  source?: string
  children: ReactNode
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children ?? '—'}</dd>
      {source && <dd className="text-[11px] text-slate-500">{source}</dd>}
    </div>
  )
}

function Fields({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-6 gap-y-3 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
    >
      {children}
    </dl>
  )
}

function yearsSince(value: string | null): number | null {
  if (!value) return null
  const years = (Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600 * 1000)
  return Math.floor(years)
}

/**
 * The carrier intelligence packet: one printable page with the overall view of a carrier, built
 * only from what the other tabs already load. It reports what FMCSA's records show and gives no
 * score or verdict of its own.
 */
export function PacketSection({ profile }: { profile: CarrierProfile }) {
  const authority = useCarrierAuthority(profile.usdot_number)
  const network = useCarrierNetwork(profile.usdot_number)
  const equipment = useCarrierEquipment(profile.usdot_number)

  if (authority.isPending || network.isPending || equipment.isPending) {
    return <p className="text-sm text-slate-500">Building the packet from FMCSA records…</p>
  }
  if (!authority.data || !network.data || !equipment.data) {
    return (
      <p className="text-sm text-red-700">
        Could not load every section for the packet; the individual tabs show what is available.
      </p>
    )
  }

  const auth = authority.data
  const net = network.data
  const fleet = equipment.data.fleet
  const recent = profile.safety.recent
  const { watch, good } = packetItems(profile, auth, net, brokerFlags(net, profile))
  const physical = profile.addresses.find((a) => a.address_type === 'PHYSICAL')
  const address = physical
    ? [physical.street, physical.city, [physical.state, physical.zip].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null
  const years = yearsSince(profile.first_registered_date)
  const dockets = auth.dockets.map((d) => `${d.prefix}${d.number}`)
  const bipd = auth.current_insurance.find((f) => f.insurance_type === 'BIPD')
  const docket = auth.dockets[0]
  const oos = net.registration_checks.find((c) => c.key === 'oos')
  const truckYears = equipment.data.vehicles
    .filter((v) => v.year && v.vehicle_type !== 'TRAILER')
    .map((v) => new Date().getFullYear() - (v.year ?? 0))
  const avgAge = truckYears.length
    ? (truckYears.reduce((a, b) => a + b, 0) / truckYears.length).toFixed(1)
    : null
  const agents = (auth.process_agents ?? []).filter((a) => a.source_system === 'MOTUS')
  const agent = (agents.length ? agents : (auth.process_agents ?? []))[0]
  const events = profile.timeline
    .filter((e) => e.severity === 'HIGH' || e.severity === 'MEDIUM')
    .slice(0, SIGNIFICANT_EVENTS)
  const linked = net.linked_carriers.filter((c) => c.shares.some((s) => s.kind !== 'building'))
  const generated = new Date()
  const census = censusLabel(profile.last_refreshed_at)

  function saveAsPdf() {
    // The browser names the PDF after the page title.
    const title = document.title
    document.title = `CarrierIQ packet - ${profile.legal_name} - USDOT ${profile.usdot_number}`
    window.print()
    document.title = title
  }

  return (
    <article
      id="carrier-packet"
      className="space-y-7 rounded-lg border border-slate-200 bg-surface px-6 py-6 sm:px-10"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-[0.3em] text-slate-900">CARRIERIQ</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Carrier intelligence packet
          </div>
        </div>
        <button
          type="button"
          onClick={saveAsPdf}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-accent-strong print:hidden"
        >
          <Printer className="size-4" aria-hidden />
          Download / Save as PDF
        </button>
      </header>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {profile.legal_name}
        </h1>
        {profile.dba_name && <p className="text-sm text-slate-600">DBA {profile.dba_name}</p>}
        <p className="mt-1 text-sm text-slate-500">
          {[`USDOT ${profile.usdot_number}`, ...dockets, address].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-3 border-y border-slate-200 py-2 text-xs text-slate-500">
          Generated {formatLocalDate(generated.toISOString())} from public FMCSA and NHTSA records
          (FMCSA data refreshed {formatLocalDate(profile.last_refreshed_at)}). This packet reports
          what the records show; it is not an FMCSA safety rating and not a recommendation to use or
          avoid any carrier. CarrierIQ gives no score or verdict of its own.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Block
          title={`Needs attention · ${watch.length}`}
          source="Each item names its FMCSA record"
        >
          {watch.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing in the checks CarrierIQ runs on FMCSA’s records.
            </p>
          ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              {watch.map((item) => (
                <li key={item.key}>
                  <span className="font-semibold text-slate-900">{item.title}</span>
                  {item.detail && <> — {item.detail}</>}
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block
          title={`In good standing · ${good.length}`}
          source="Each item names its FMCSA record"
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            {good.map((item) => (
              <li key={item.key}>
                <span className="font-semibold text-slate-900">{item.title}</span>
                {item.detail && <> — {item.detail}</>}
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <Block title="Identity & authority" source="FMCSA census unless noted">
        <Fields>
          <Field label="USDOT registration" source={census}>
            {profile.registration_status && humanize(profile.registration_status.toLowerCase())}
          </Field>
          {auth.dockets.map((d) => (
            <Field
              key={`${d.prefix}${d.number}`}
              label={`Authority ${d.prefix}${d.number}`}
              source={sourceLabel(d.status_source, d.status_as_of)}
            >
              {d.status ? humanize(d.status.toLowerCase()) : 'Unknown'}
              {d.authority_type && (
                <span className="block text-xs font-normal text-slate-500">{d.authority_type}</span>
              )}
            </Field>
          ))}
          <Field label="Operation">
            {classifications(profile.operation_classification)
              .map(classificationLabel)
              .join(', ') || null}
          </Field>
          <Field label="Safety rating">
            {profile.safety.safety_rating
              ? `${humanize(profile.safety.safety_rating.toLowerCase())}${
                  profile.safety.safety_rating_date
                    ? ` (${formatDate(profile.safety.safety_rating_date)})`
                    : ''
                }`
              : 'Not rated'}
          </Field>
          <Field label="Registered">
            {profile.first_registered_date &&
              `${formatDate(profile.first_registered_date)}${years !== null ? ` · ${years} yr` : ''}`}
          </Field>
          <Field label="Out-of-service order" source="FMCSA Out of Service Orders">
            {oos ? (oos.status === 'alert' ? 'Active' : 'None active') : null}
          </Field>
          <Field label="Last MCS-150">{formatDate(profile.last_mcs150_date)}</Field>
          <Field label="Phone">
            {profile.phones.map((p) => formatPhone(p.number)).join(', ') || null}
          </Field>
          <Field label="Email">{profile.email}</Field>
          <Field label="Website">{profile.website}</Field>
          <Field label="Address">
            {address}
            {physical?.undeliverable && (
              <span className="block text-xs font-normal text-amber-700">
                Marked undeliverable by FMCSA
              </span>
            )}
          </Field>
          <Field label="Officers">{profile.officers.join(', ') || null}</Field>
        </Fields>
      </Block>

      <div className="grid gap-6 md:grid-cols-2">
        <Block title="Fleet" source="FMCSA census (MCS-150), FMCSA inspections, NHTSA vPIC">
          <Fields columns={2}>
            <Field label="Power units (MCS-150)">{fleet.registered_power_units}</Field>
            <Field label="Drivers (MCS-150)">{profile.driver_count}</Field>
            <Field label={`Power units seen · ${fleet.recent_months} mo`}>
              {fleet.recent_power_units}
            </Field>
            <Field label="Vehicles seen on inspections">{fleet.observed_vehicles}</Field>
            <Field label="Avg model age (decoded trucks)">{avgAge && `${avgAge} yr`}</Field>
            <Field label="VINs also on other carriers">{equipment.data.shared_vin_count}</Field>
          </Fields>
        </Block>
        <Block title="Insurance" source="FMCSA insurance filings unless noted">
          <Fields columns={2}>
            <Field
              label="BI&PD on file"
              source={docket ? sourceLabel(docket.status_source, docket.status_as_of) : undefined}
            >
              {docket?.bipd_on_file ? formatMoney(docket.bipd_on_file) : 'None'}
            </Field>
            <Field label="BI&PD required">
              {docket?.bipd_required ? formatMoney(docket.bipd_required) : 'None'}
            </Field>
            <Field
              label="Insurer"
              source={bipd ? sourceLabel(bipd.source_system, bipd.status_as_of) : undefined}
            >
              {bipd?.insurer}
            </Field>
            <Field label="Current filing since">{formatDate(bipd?.effective_date ?? null)}</Field>
            <Field label="Cargo">
              {docket?.cargo_required
                ? docket.cargo_on_file
                  ? 'Required · on file'
                  : 'Required · not on file'
                : 'Not required'}
            </Field>
            <Field label="Bond">
              {docket?.bond_required
                ? docket.bond_on_file
                  ? 'Required · on file'
                  : 'Required · not on file'
                : 'Not required'}
            </Field>
            {auth.renewals.map((r) => (
              <Field
                key={`${r.docket}-${r.insurance_type}`}
                label="Usual renewal (estimate)"
                source="From FMCSA filing start dates"
              >
                Around {formatDate(r.expected)}
                <span className="block text-xs font-normal text-slate-500">
                  {r.state === 'unconfirmed'
                    ? 'After the public data stopped updating; cannot be confirmed'
                    : `Yearly since ${r.since.slice(0, 4)}`}
                </span>
              </Field>
            ))}
            <Field
              label="Process agent (BOC-3)"
              source={
                agent
                  ? agent.source_system === 'MOTUS'
                    ? 'FMCSA Motus BOC-3'
                    : 'FMCSA L&I BOC-3 (old system only)'
                  : 'FMCSA BOC-3 filings'
              }
            >
              {agent ? agent.name : auth.process_agents ? 'None listed' : null}
            </Field>
          </Fields>
        </Block>
      </div>

      <Block
        title={`Safety · last ${recent?.months ?? 24} months`}
        source="FMCSA inspections; national averages from FMCSA SAFER"
      >
        <Fields>
          <Field label="Inspections">
            {recent?.inspections ?? profile.safety.inspection_count}
          </Field>
          <Field label="Vehicle out-of-service">
            {recent && (
              <>
                {formatPercent(recent.vehicle_oos_rate)}{' '}
                <span className="font-normal text-slate-500">
                  (national {formatPercent(recent.national_vehicle_oos_rate)})
                </span>
                <span className="block text-xs font-normal text-slate-500">
                  {recent.vehicle_oos} of {recent.vehicle_inspections} inspections that examined the
                  vehicle
                </span>
              </>
            )}
          </Field>
          <Field label="Driver out-of-service">
            {recent && (
              <>
                {formatPercent(recent.driver_oos_rate)}{' '}
                <span className="font-normal text-slate-500">
                  (national {formatPercent(recent.national_driver_oos_rate)})
                </span>
                <span className="block text-xs font-normal text-slate-500">
                  {recent.driver_oos} of {recent.driver_inspections} inspections that examined the
                  driver
                </span>
              </>
            )}
          </Field>
          <Field label="Last inspection">{formatDate(profile.safety.last_inspection_date)}</Field>
          <Field label="Crashes">
            <span className="font-normal text-slate-500">Crash data not loaded yet</span>
          </Field>
        </Fields>
      </Block>

      {linked.length > 0 && (
        <Block title="Linked carriers" source="FMCSA census">
          <ul className="space-y-1 text-sm text-slate-700">
            {linked.map((c) => (
              <li key={c.usdot_number}>
                <span className="font-medium text-slate-900">
                  {c.legal_name ?? 'A carrier not in the census'}
                </span>{' '}
                <span className="text-slate-500">
                  (USDOT {c.usdot_number}
                  {c.status === 'INACTIVE' && ', not active'})
                </span>{' '}
                — same{' '}
                {c.shares
                  .filter((s) => s.kind !== 'building')
                  .map((s) => s.kind)
                  .join(' and ')}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {events.length > 0 && (
        <Block title="Recent significant events" source="FMCSA authority and insurance history">
          <ul className="space-y-1 text-sm text-slate-700">
            {events.map((e) => (
              <li key={`${e.event_type}-${e.event_date}-${e.title}`}>
                <span className="tabular-nums text-slate-500">{formatDate(e.event_date)}</span> ·{' '}
                {e.title}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <footer className="border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
        Sources: FMCSA Company Census, inspections, Motus and L&I authority, insurance and BOC-3
        filings, out-of-service and revocation orders (U.S. DOT Open Data Portal); NHTSA vPIC for
        VIN decoding. Out-of-service rates follow FMCSA’s method (only inspections that examined the
        vehicle or driver count); national averages are FMCSA’s published figures. Linked carriers
        are relationships to review, not findings. Packet generated {generated.toLocaleString()}.
      </footer>
    </article>
  )
}
